import type { AccountsRepository } from "../accounts";
import type { LedgerService } from "../ledger";
import { Money, notional, Qty } from "../money";
import type { OrdersService } from "../orders";
import type { CanonicalBrokerEvent, Order } from "../orders";
import { applyBuyFill, applySellFill, type PositionsRepository } from "../portfolio";
import { AppError, invariant, type Clock, type TransactionRunner, type TxHandle } from "../shared";
import type { Broker } from "./broker";

/**
 * ExecutionService (docs/architecture/EXECUTION.md): routes orders to the
 * Broker and applies canonical events atomically — order state + fill + ledger
 * + position + cash projection in ONE transaction, under the fixed lock order
 * account → order → position (ADR-008). Canonical events are the ONLY input
 * that mutates execution-derived financial state.
 */

export interface FillRecord {
  orderId: string;
  qty: Qty;
  price: string;
  fee: string;
  notional: string;
  broker: NonNullable<Order["broker"]>;
  executionId: string;
  occurredAt: Date;
}

export interface FillsRepository {
  /** Returns false on (broker, execution_id) conflict — duplicate delivery. */
  insert(tx: TxHandle, fill: FillRecord): Promise<boolean>;
  /** True if this venue execution was already applied (exactly-once gate). */
  existsByExecutionId(
    tx: TxHandle,
    broker: NonNullable<Order["broker"]>,
    executionId: string,
  ): Promise<boolean>;
  listForOrder(tx: TxHandle, orderId: string): Promise<FillRecord[]>;
}

export class ExecutionService {
  constructor(
    private readonly broker: Broker,
    private readonly orders: OrdersService,
    private readonly accounts: AccountsRepository,
    private readonly positions: PositionsRepository,
    private readonly fills: FillsRepository,
    private readonly ledger: LedgerService,
    private readonly txRunner: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  /** Wire the in-process event stream (deterministic broker) or replayed stream (worker). */
  start(): void {
    this.broker.subscribe(null, (event) => this.onBrokerEvent(event));
  }

  /**
   * Submit a placed order (PENDING_SUBMISSION) to the venue. Ack/rejection
   * arrive as events. Transport failure -> retry once -> reconcile-check ->
   * SUBMIT_FAILED only if the venue provably never received it.
   */
  async submit(orderId: string): Promise<void> {
    const { order, brokerAccountId } = await this.txRunner.run(async (tx) => {
      const o = await this.orders.getById(tx, orderId);
      invariant(o, `submit: order ${orderId} not found`);
      const ref = await this.accounts.getBrokerAccount(tx, o.accountId);
      invariant(ref, `submit: no broker account for account ${o.accountId}`);
      return { order: o, brokerAccountId: ref.externalAccountId };
    });
    if (order.state !== "PENDING_SUBMISSION") return; // replay/duplicate submit

    const request = {
      clientOrderId: order.id,
      brokerAccountId,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      qty: order.qty.subtract(order.filledQty),
      limitPrice: order.limitPrice,
      tif: order.tif,
      extendedHours: false,
    };

    try {
      await this.broker.submit(request);
    } catch (firstErr) {
      // Never silent: a swallowed first failure here once masked an event-
      // application bug (the retry deduped at the venue without re-emitting).
      console.error(
        JSON.stringify({
          level: "error",
          msg: "broker submit failed; retrying",
          orderId: order.id,
          err: String(firstErr),
        }),
      );
      try {
        await this.broker.submit(request); // one retry
      } catch (err) {
        // Reconcile-check: only SUBMIT_FAILED when the venue has no such order.
        const snapshot = await this.broker
          .getOrderByClientId(brokerAccountId, order.id)
          .catch(() => null);
        if (snapshot === null) {
          await this.txRunner.run(async (tx) => {
            const locked = await this.lockOrder(tx, order.id);
            await this.orders.applyTransition(tx, locked, {
              type: "ORDER_SUBMIT_FAILED",
              source: "local",
              broker: this.broker.kind,
              externalEventId: null,
              occurredAt: this.clock.now(),
              rejectReason: "submission failed",
            });
          });
          return;
        }
        // Venue has it — its events/reconciliation will converge the state.
        throw err;
      }
    }
  }

  /** Ask the venue to cancel; the outcome (CANCELLED or fill-won-race) arrives as events. */
  async requestVenueCancel(orderId: string): Promise<void> {
    const { order, brokerAccountId } = await this.txRunner.run(async (tx) => {
      const o = await this.orders.getById(tx, orderId);
      invariant(o, `cancel: order ${orderId} not found`);
      const ref = await this.accounts.getBrokerAccount(tx, o.accountId);
      invariant(ref, `cancel: no broker account`);
      return { order: o, brokerAccountId: ref.externalAccountId };
    });
    await this.broker.cancel(brokerAccountId, order.id);
  }

  /**
   * Apply one canonical broker event: the exactly-once boundary. Duplicate
   * events (same external id / execution id) commit as no-ops (invariant 15).
   */
  async onBrokerEvent(event: CanonicalBrokerEvent): Promise<void> {
    await this.txRunner.run(async (tx) => {
      const preliminary = await this.orders.getById(tx, event.clientOrderId);
      if (!preliminary) {
        // Event for an order Arthosrot doesn't know — reconciliation surface,
        // never silently dropped.
        throw new AppError("INTERNAL", `broker event for unknown order ${event.clientOrderId}`);
      }

      // Lock order: account -> order (fixed order, ADR-008).
      await this.accounts.lockForUpdate(tx, preliminary.accountId);
      const order = await this.lockOrder(tx, event.clientOrderId);

      const isFill = event.type === "ORDER_PARTIALLY_FILLED" || event.type === "ORDER_FILLED";

      // Exactly-once gate for fills: the SAME venue execution can arrive under
      // DIFFERENT event envelopes (stream ULID vs reconciliation-synthesized
      // id), so the envelope dedupe below is not sufficient — a replayed
      // execution must be rejected BEFORE any order mutation, or filledQty
      // drifts from fills/cash/positions. Race-free: the account lock above
      // serializes all appliers for this account.
      if (isFill) {
        invariant(event.executionId, "fill event missing execution id");
        const applied = await this.fills.existsByExecutionId(tx, event.broker, event.executionId);
        if (applied) return; // duplicate execution — full no-op (invariant 15)
      }

      const transitioned = await this.orders.applyTransition(tx, order, {
        type: event.type,
        source: "broker",
        broker: event.broker,
        brokerOrderId: event.brokerOrderId,
        externalEventId: event.externalEventId,
        occurredAt: event.occurredAt,
        raw: event.raw,
        ...(isFill ? { fillQty: event.fillQty } : {}),
        ...(event.type === "ORDER_REJECTED"
          ? { rejectReason: rawReason(event) ?? "rejected by venue" }
          : {}),
      });
      if (transitioned === null) return; // duplicate event — no-op

      if (isFill) {
        await this.applyFillEffects(tx, transitioned, event);
      }
    });
  }

  /** Fill effects: fills row + ledger entries + position, atomically (invariant 7). */
  private async applyFillEffects(
    tx: TxHandle,
    order: Order,
    event: CanonicalBrokerEvent,
  ): Promise<void> {
    invariant(event.fillQty && event.fillPrice && event.executionId, "fill event missing fields");
    const fee = event.fee ?? Money.zero();
    const amount = notional(event.fillPrice, event.fillQty);

    const fresh = await this.fills.insert(tx, {
      orderId: order.id,
      qty: event.fillQty,
      price: event.fillPrice.toString(),
      fee: fee.toString(),
      notional: amount.toString(),
      broker: event.broker,
      executionId: event.executionId,
      occurredAt: event.occurredAt,
    });
    // The execution-id gate in onBrokerEvent runs before any mutation, under
    // the account lock — a conflict here means that gate was bypassed. Fail
    // loudly and roll back rather than committing a half-applied fill.
    invariant(fresh, `duplicate execution ${event.executionId} slipped past the dedupe gate`);

    const fillId = `${event.broker}:${event.executionId}`;
    const position = await this.positions.getForUpdate(tx, order.accountId, order.instrumentId);

    if (order.side === "BUY") {
      const { position: next } = applyBuyFill(
        position,
        { accountId: order.accountId, instrumentId: order.instrumentId, symbol: order.symbol },
        event.fillQty,
        amount,
        fee,
      );
      await this.positions.upsert(tx, next);
      await this.ledger.post(tx, {
        accountId: order.accountId,
        entryType: "TRADE",
        amount: amount.negate(),
        refType: "FILL",
        refId: fillId,
        description: `Bought ${event.fillQty.toString()} ${order.symbol} @ ${event.fillPrice.toString()}`,
      });
    } else {
      const { position: next } = applySellFill(position, event.fillQty, amount, fee);
      await this.positions.upsert(tx, next);
      await this.ledger.post(tx, {
        accountId: order.accountId,
        entryType: "TRADE",
        amount,
        refType: "FILL",
        refId: fillId,
        description: `Sold ${event.fillQty.toString()} ${order.symbol} @ ${event.fillPrice.toString()}`,
      });
    }

    if (!fee.isZero()) {
      await this.ledger.post(tx, {
        accountId: order.accountId,
        entryType: "FEE",
        amount: fee.negate(),
        refType: "FILL",
        refId: fillId,
        description: `Fee on ${order.symbol} fill`,
      });
    }
  }

  private async lockOrder(tx: TxHandle, orderId: string): Promise<Order> {
    const order = await this.orders.getByIdForUpdate(tx, orderId);
    invariant(order, `order ${orderId} not found for locking`);
    return order;
  }
}

function rawReason(event: CanonicalBrokerEvent): string | null {
  if (event.raw && typeof event.raw === "object" && "reason" in event.raw) {
    return String((event.raw as { reason: unknown }).reason);
  }
  return null;
}
