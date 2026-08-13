import type { BrokerAccountRef } from "../../accounts";
import type {
  Broker,
  BrokerAccountSnapshot,
  BrokerOrderRequest,
  BrokerOrderSnapshot,
  CancelResult,
  EventCursor,
  ProvisionRequest,
  Subscription,
  SubmitResult,
} from "../../execution/broker";
import { isFreshEnoughForExecution, type MarketDataProvider } from "../../market-data";
import { Money, Px, Qty } from "../../money";
import type { CanonicalBrokerEvent, CanonicalEventType } from "../../orders";
import type { Clock } from "../../shared";

/**
 * DeterministicPaperBroker — the execution venue for tests, CI, local, and
 * offline development (ADR-006). It implements the SAME contract as the
 * external venue and passes the same compliance suite; it is not a second set
 * of semantics.
 *
 * Being its own execution authority (unlike the external venue), it DOES
 * enforce quote freshness and market hours (ADR-007 split).
 */

export interface DeterministicBrokerConfig {
  /** Slippage applied to market fills, in basis points (0 = fill at reference). */
  slippageBps: number;
  /** Flat per-fill fee. */
  flatFee: Money;
  /** Split fills into chunks of this size to exercise partial fills (0 = single fill). */
  chunkFills: number;
  /** Reject market orders when the quote is older than this (ms). */
  maxQuoteAgeMs: number;
  /** Reject orders outside the regular session. */
  enforceMarketHours: boolean;
}

export const DEFAULT_DETERMINISTIC_CONFIG: DeterministicBrokerConfig = {
  slippageBps: 0,
  flatFee: Money.zero(),
  chunkFills: 0,
  maxQuoteAgeMs: 10_000,
  enforceMarketHours: true,
};

interface RestingOrder {
  req: BrokerOrderRequest;
  brokerOrderId: string;
  filled: bigint;
  status: "accepted" | "cancel_pending" | "terminal";
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${String(sequence).padStart(8, "0")}`;
}

export class DeterministicPaperBroker implements Broker {
  readonly kind = "DETERMINISTIC" as const;

  private readonly resting = new Map<string, RestingOrder>();
  private readonly submitted = new Map<string, string>(); // clientOrderId -> brokerOrderId
  private readonly log: CanonicalBrokerEvent[] = [];
  private listeners = new Set<(e: CanonicalBrokerEvent) => Promise<void>>();
  private readonly accountCash = new Map<string, Money>();

  constructor(
    private readonly clock: Clock,
    private readonly marketData: MarketDataProvider,
    private config: DeterministicBrokerConfig = DEFAULT_DETERMINISTIC_CONFIG,
  ) {}

  /** Test hook: change execution behavior between scenarios. */
  configure(patch: Partial<DeterministicBrokerConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  async provisionAccount(req: ProvisionRequest): Promise<BrokerAccountRef> {
    const externalAccountId = `det-acct-${req.ledgerlineAccountId}`;
    this.accountCash.set(externalAccountId, req.startingCash);
    return { broker: this.kind, externalAccountId };
  }

  async submit(req: BrokerOrderRequest): Promise<SubmitResult> {
    const existing = this.submitted.get(req.clientOrderId);
    if (existing) return { brokerOrderId: existing, duplicate: true };

    const brokerOrderId = nextId("det-order");
    this.submitted.set(req.clientOrderId, brokerOrderId);

    await this.emit(req, brokerOrderId, "ORDER_ACKNOWLEDGED");

    const { status } = await this.marketData.getMarketStatus();
    if (this.config.enforceMarketHours && status !== "OPEN") {
      await this.emit(req, brokerOrderId, "ORDER_REJECTED", { reason: "market closed" });
      return { brokerOrderId, duplicate: false };
    }

    const quote = await this.marketData.getQuote(req.symbol);
    if (
      req.type === "MARKET" &&
      !isFreshEnoughForExecution(quote, this.clock.now(), this.config.maxQuoteAgeMs)
    ) {
      await this.emit(req, brokerOrderId, "ORDER_REJECTED", { reason: "stale quote" });
      return { brokerOrderId, duplicate: false };
    }

    await this.emit(req, brokerOrderId, "ORDER_ACCEPTED");
    this.resting.set(req.clientOrderId, { req, brokerOrderId, filled: 0n, status: "accepted" });

    if (req.type === "MARKET") {
      await this.fill(
        req.clientOrderId,
        this.marketFillPrice(req, quote.ask, quote.last, quote.bid),
      );
    } else {
      await this.evaluateResting(req.clientOrderId);
    }
    return { brokerOrderId, duplicate: false };
  }

  async cancel(_brokerAccountId: string, clientOrderId: string): Promise<CancelResult> {
    const order = this.resting.get(clientOrderId);
    if (!order || order.status === "terminal") {
      return { accepted: false, reason: "order not cancellable" };
    }
    order.status = "cancel_pending";
    await this.emit(order.req, order.brokerOrderId, "ORDER_CANCEL_PENDING");
    await this.emit(order.req, order.brokerOrderId, "ORDER_CANCELLED");
    order.status = "terminal";
    return { accepted: true };
  }

  async getOrderByClientId(
    _brokerAccountId: string,
    clientOrderId: string,
  ): Promise<BrokerOrderSnapshot | null> {
    const brokerOrderId = this.submitted.get(clientOrderId);
    if (!brokerOrderId) return null;
    const order = this.resting.get(clientOrderId);
    const events = this.log.filter((e) => e.clientOrderId === clientOrderId);
    const last = events.at(-1);
    return {
      clientOrderId,
      brokerOrderId,
      status: last?.type ?? "unknown",
      filledQty: Qty.of(order?.filled ?? 0n),
      events,
    };
  }

  async listOpenOrders(_brokerAccountId: string): Promise<BrokerOrderSnapshot[]> {
    const out: BrokerOrderSnapshot[] = [];
    for (const [clientOrderId, order] of this.resting) {
      if (order.status === "terminal") continue;
      const snapshot = await this.getOrderByClientId(_brokerAccountId, clientOrderId);
      if (snapshot) out.push(snapshot);
    }
    return out;
  }

  async getAccountSnapshot(brokerAccountId: string): Promise<BrokerAccountSnapshot> {
    return {
      externalAccountId: brokerAccountId,
      cash: this.accountCash.get(brokerAccountId) ?? Money.zero(),
      positions: [],
    };
  }

  subscribe(
    cursor: EventCursor | null,
    onEvent: (event: CanonicalBrokerEvent) => Promise<void>,
  ): Subscription {
    // Replay from the cursor, then stream live — the same contract the SSE
    // adapter provides (exactly-once is the consumer's job).
    const startIndex = cursor
      ? this.log.findIndex((e) => e.externalEventId === cursor.lastExternalEventId) + 1
      : this.log.length;
    void (async () => {
      for (const event of this.log.slice(Math.max(0, startIndex))) {
        await onEvent(event);
      }
    })();
    this.listeners.add(onEvent);
    return {
      close: () => {
        this.listeners.delete(onEvent);
      },
    };
  }

  /** Test hook: move the market and re-evaluate every resting limit order. */
  async tick(): Promise<void> {
    for (const clientOrderId of [...this.resting.keys()]) {
      await this.evaluateResting(clientOrderId);
    }
  }

  /** Test hook: expire remaining DAY orders (venue end-of-session behavior). */
  async expireDayOrders(): Promise<void> {
    for (const order of this.resting.values()) {
      if (order.status === "terminal") continue;
      await this.emit(order.req, order.brokerOrderId, "ORDER_EXPIRED");
      order.status = "terminal";
    }
  }

  private marketFillPrice(req: BrokerOrderRequest, ask: Px | null, last: Px, bid: Px | null): Px {
    const reference = req.side === "BUY" ? (ask ?? last) : (bid ?? last);
    if (this.config.slippageBps === 0) return reference;
    const factor =
      req.side === "BUY"
        ? 1 + this.config.slippageBps / 10_000
        : 1 - this.config.slippageBps / 10_000;
    return Px.fromString(reference.toDecimal().mul(factor.toFixed(6)).toFixed(4));
  }

  private async evaluateResting(clientOrderId: string): Promise<void> {
    const order = this.resting.get(clientOrderId);
    if (!order || order.status !== "accepted" || order.req.type !== "LIMIT") return;
    const { status } = await this.marketData.getMarketStatus();
    if (this.config.enforceMarketHours && status !== "OPEN") return;

    const quote = await this.marketData.getQuote(order.req.symbol);
    const limit = order.req.limitPrice;
    if (!limit) return;

    if (order.req.side === "BUY") {
      const market = quote.ask ?? quote.last;
      if (market.lte(limit)) await this.fill(clientOrderId, market.min(limit));
    } else {
      const market = quote.bid ?? quote.last;
      if (market.gte(limit)) await this.fill(clientOrderId, market.max(limit));
    }
  }

  /** Emit fill events for the remaining quantity, chunked when configured. */
  private async fill(clientOrderId: string, price: Px): Promise<void> {
    const order = this.resting.get(clientOrderId);
    if (!order) return;
    const total = order.req.qty.toBigInt();
    const chunk = BigInt(this.config.chunkFills || 0);

    while (order.filled < total) {
      const remaining = total - order.filled;
      const size = chunk > 0n && chunk < remaining ? chunk : remaining;
      order.filled += size;
      const isFinal = order.filled === total;
      await this.emit(
        order.req,
        order.brokerOrderId,
        isFinal ? "ORDER_FILLED" : "ORDER_PARTIALLY_FILLED",
        { fillQty: Qty.of(size), fillPrice: price },
      );
      if (isFinal) {
        order.status = "terminal"; // kept in the map: snapshots serve reconciliation
      }
      if (chunk === 0n) break;
    }
  }

  private async emit(
    req: BrokerOrderRequest,
    brokerOrderId: string,
    type: CanonicalEventType,
    extra: { fillQty?: Qty; fillPrice?: Px; reason?: string } = {},
  ): Promise<void> {
    const event: CanonicalBrokerEvent = {
      type,
      broker: this.kind,
      brokerAccountId: req.brokerAccountId,
      brokerOrderId,
      clientOrderId: req.clientOrderId,
      externalEventId: nextId("det-evt"),
      occurredAt: this.clock.now(),
      ...(extra.fillQty
        ? {
            executionId: nextId("det-exec"),
            fillQty: extra.fillQty,
            fillPrice: extra.fillPrice,
            fee: this.config.flatFee,
          }
        : {}),
      ...(extra.reason ? { raw: { reason: extra.reason } } : {}),
    };
    this.log.push(event);
    for (const listener of this.listeners) {
      await listener(event);
    }
  }
}
