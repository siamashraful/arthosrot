import type { Account, AccountsRepository } from "../accounts";
import type { Instrument } from "../instruments";
import { Money, notional, Px, Qty, reserveWithBuffer } from "../money";
import { AppError, invariant, type TransactionRunner, type TxHandle } from "../shared";
import { isTerminal, planTransitions } from "./state-machine";
import {
  OPEN_STATES,
  type CanonicalEventType,
  type Order,
  type OrderEventSource,
  type OrderSide,
  type OrderState,
  type OrderType,
} from "./types";

export interface NewOrderInput {
  account: Account;
  instrument: Instrument;
  side: OrderSide;
  type: OrderType;
  qty: Qty;
  limitPrice: Px | null;
  /** Reference price for market-BUY reservations (ask ?? last). */
  refPrice: Px | null;
  idempotencyKey: string;
}

export interface PlacedOrder {
  order: Order;
  /** true when the idempotency key matched an existing order (safe replay). */
  replayed: boolean;
}

export interface OrderEventRecord {
  orderId: string;
  canonicalEventType: CanonicalEventType;
  fromState: OrderState | null;
  toState: OrderState | null;
  source: OrderEventSource;
  broker: Order["broker"];
  externalEventId: string | null;
  occurredAt: Date;
  rawPayload?: unknown;
}

export interface OrdersRepository {
  insert(tx: TxHandle, input: NewOrderInput & { reservedCash: Money }): Promise<Order | null>; // null = idempotency conflict (caller re-fetches)
  getById(tx: TxHandle, id: string): Promise<Order | null>;
  getByIdForUpdate(tx: TxHandle, id: string): Promise<Order | null>;
  getByIdempotencyKey(tx: TxHandle, accountId: string, key: string): Promise<Order | null>;
  listForAccount(
    tx: TxHandle,
    accountId: string,
    openOnly: boolean,
    limit: number,
  ): Promise<Order[]>;
  update(
    tx: TxHandle,
    id: string,
    patch: Partial<{
      state: OrderState;
      filledQty: Qty;
      reservedCash: Money;
      broker: Order["broker"];
      brokerOrderId: string;
      rejectReason: string;
      needsAttention: boolean;
    }>,
  ): Promise<void>;
  /** Σ reserved_cash over open BUY orders — the buying-power reservation total. */
  sumOpenBuyReservations(tx: TxHandle, accountId: string): Promise<Money>;
  /** Σ (qty - filled_qty) over open SELL orders for one instrument. */
  sumOpenSellRemainders(tx: TxHandle, accountId: string, instrumentId: string): Promise<Qty>;
  /** Insert an audit event; returns false on external_event_id conflict (duplicate delivery). */
  insertEvent(tx: TxHandle, event: OrderEventRecord): Promise<boolean>;
  listEvents(tx: TxHandle, orderId: string): Promise<OrderEventRecord[]>;
}

/** Read port implemented by core/portfolio's positions store. */
export interface PositionReader {
  getQty(tx: TxHandle, accountId: string, instrumentId: string): Promise<Qty>;
}

export interface OrdersConfig {
  marketBuyBuffer: number;
}

export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly accounts: AccountsRepository,
    private readonly positions: PositionReader,
    private readonly txRunner: TransactionRunner,
    private readonly config: OrdersConfig,
  ) {}

  /**
   * Validate + reserve + insert (PENDING_SUBMISSION), under the account row
   * lock (ADR-008). Request-validation failures raise VALIDATION/DOMAIN_RULE
   * errors and create NO order row — venue rejection is a separate lifecycle
   * state (docs/architecture/EXECUTION.md rejection taxonomy).
   */
  async place(input: NewOrderInput): Promise<PlacedOrder> {
    this.validateShape(input);

    return this.txRunner.run(async (tx) => {
      const account = await this.accounts.lockForUpdate(tx, input.account.id);
      if (account.status !== "ACTIVE") {
        throw new AppError("DOMAIN_RULE", "Trading account is not active", {
          subcode: "ACCOUNT_NOT_ACTIVE",
        });
      }

      // Idempotent replay (link 1 of the chain): same key returns the original.
      const existing = await this.repo.getByIdempotencyKey(tx, account.id, input.idempotencyKey);
      if (existing) return { order: existing, replayed: true };

      const reservedCash = input.side === "BUY" ? this.buyReservation(input) : Money.zero();

      if (input.side === "BUY") {
        const alreadyReserved = await this.repo.sumOpenBuyReservations(tx, account.id);
        const buyingPower = account.cashBalance.subtract(alreadyReserved);
        if (reservedCash.toDecimal().gt(buyingPower.toDecimal())) {
          throw new AppError(
            "DOMAIN_RULE",
            `Order needs ${reservedCash.toString()} but buying power is ${buyingPower.toString()}`,
            { subcode: "INSUFFICIENT_BUYING_POWER" },
          );
        }
      } else {
        const held = await this.positions.getQty(tx, account.id, input.instrument.id);
        const reserved = await this.repo.sumOpenSellRemainders(tx, account.id, input.instrument.id);
        const sellable = held.gte(reserved) ? held.subtract(reserved) : Qty.of(0);
        if (input.qty.gt(sellable)) {
          throw new AppError(
            "DOMAIN_RULE",
            `Sell of ${input.qty.toString()} exceeds sellable quantity ${sellable.toString()}`,
            { subcode: "INSUFFICIENT_HOLDINGS" },
          );
        }
      }

      const inserted = await this.repo.insert(tx, { ...input, reservedCash });
      if (inserted) return { order: inserted, replayed: false };

      // Unique-violation race on the same key: someone inserted concurrently.
      const raced = await this.repo.getByIdempotencyKey(tx, account.id, input.idempotencyKey);
      invariant(raced, "idempotency conflict without a matching order");
      return { order: raced, replayed: true };
    });
  }

  /**
   * Apply the canonical state machine and maintain reservations. The caller
   * (ExecutionService) owns the transaction and the fill/ledger/position side
   * effects; this method owns state + reservation + audit consistency.
   * Returns the transitioned order, or null if the event was a duplicate.
   */
  async applyTransition(
    tx: TxHandle,
    order: Order,
    event: {
      type: CanonicalEventType;
      source: OrderEventSource;
      broker: Order["broker"];
      brokerOrderId?: string | null;
      externalEventId: string | null;
      occurredAt: Date;
      raw?: unknown;
      fillQty?: Qty;
      rejectReason?: string;
    },
  ): Promise<Order | null> {
    // Duplicate delivery (link 3): unique external_event_id makes replay a no-op.
    const fresh = await this.repo.insertEvent(tx, {
      orderId: order.id,
      canonicalEventType: event.type,
      fromState: order.state,
      toState: null, // patched below once the plan is known
      source: event.source,
      broker: event.broker,
      externalEventId: event.externalEventId,
      occurredAt: event.occurredAt,
      rawPayload: event.raw,
    });
    if (!fresh) return null;

    if (event.type === "UNKNOWN_VENDOR_STATUS") {
      // Audit-only: no transition, flag for attention (EXECUTION.md policy).
      await this.repo.update(tx, order.id, { needsAttention: true });
      return this.mustGet(tx, order.id);
    }

    let steps;
    try {
      steps = planTransitions(order.state, event.type);
    } catch (err) {
      if (isTerminal(order.state)) {
        // Late event after terminal state (e.g. vendor `canceled` after FILLED):
        // audit row kept, no state change, surfaced for observability.
        await this.repo.update(tx, order.id, { needsAttention: true });
        return this.mustGet(tx, order.id);
      }
      throw err;
    }

    let state = order.state;
    for (const step of steps) {
      if (step.inferred) {
        await this.repo.insertEvent(tx, {
          orderId: order.id,
          canonicalEventType: "ORDER_ACCEPTED",
          fromState: step.from,
          toState: step.to,
          source: "inferred",
          broker: event.broker,
          externalEventId: null,
          occurredAt: event.occurredAt,
        });
      }
      state = step.to;
    }

    const newFilled =
      event.fillQty !== undefined ? order.filledQty.add(event.fillQty) : order.filledQty;
    invariant(
      order.qty.gte(newFilled),
      `filled qty ${newFilled.toString()} would exceed order qty ${order.qty.toString()} (invariant 1)`,
    );
    // A "final" fill must actually complete the order.
    if (state === "FILLED") {
      invariant(newFilled.equals(order.qty), "FILLED event with incomplete cumulative quantity");
    }

    const reservedCash = this.nextReservation(order, state, newFilled);

    await this.repo.update(tx, order.id, {
      state,
      filledQty: newFilled,
      reservedCash,
      ...(event.brokerOrderId ? { brokerOrderId: event.brokerOrderId } : {}),
      ...(event.broker ? { broker: event.broker } : {}),
      ...(event.rejectReason ? { rejectReason: event.rejectReason } : {}),
    });
    return this.mustGet(tx, order.id);
  }

  /**
   * Local cancellation intent: CANCEL_PENDING. The venue decides the outcome
   * (cancel-vs-fill race is resolved by whichever event arrives). Idempotent:
   * terminal or already-cancelling orders return their current state.
   */
  async requestCancel(tx: TxHandle, orderId: string, occurredAt: Date): Promise<Order> {
    const order = await this.repo.getByIdForUpdate(tx, orderId);
    if (!order) throw new AppError("NOT_FOUND", "Order not found");
    if (isTerminal(order.state) || order.state === "CANCEL_PENDING") return order;
    if (order.state === "PENDING_SUBMISSION") {
      throw new AppError("DOMAIN_RULE", "Order is still being submitted — try again in a moment", {
        subcode: "ORDER_NOT_CANCELLABLE",
      });
    }
    const updated = await this.applyTransition(tx, order, {
      type: "ORDER_CANCEL_PENDING",
      source: "local",
      broker: order.broker,
      externalEventId: null,
      occurredAt,
    });
    invariant(updated, "local cancel event can never be a duplicate");
    return updated;
  }

  private buyReservation(input: NewOrderInput): Money {
    if (input.type === "LIMIT") {
      invariant(input.limitPrice, "limit order without limit price");
      return notional(input.limitPrice, input.qty); // + estFees (0 at MVP)
    }
    invariant(input.refPrice, "market BUY requires a reference price for reservation");
    return reserveWithBuffer(input.refPrice, input.qty, this.config.marketBuyBuffer);
  }

  /** Reservation maintenance: recompute from remaining qty; zero at terminal. */
  private nextReservation(order: Order, state: OrderState, filled: Qty): Money {
    if (order.side === "SELL") return Money.zero();
    if (!OPEN_STATES.has(state)) return Money.zero();
    if (filled.isZero() || order.qty.isZero()) return order.reservedCash;
    // Scale the original reservation to the unfilled remainder (trued-up by
    // the actual fill notional at the ledger level; reservation stays
    // conservative and deterministic).
    const remaining = order.qty.subtract(filled);
    if (remaining.isZero()) return Money.zero();
    const perShare = order.reservedCash
      .toDecimal()
      .div(order.qty.subtract(order.filledQty).toString());
    return Money.fromDecimalExact(perShare.mul(remaining.toString()).toDecimalPlaces(2));
  }

  private validateShape(input: NewOrderInput): void {
    if (!input.qty.isPositive()) {
      throw new AppError("VALIDATION", "Quantity must be a positive whole number", {
        subcode: "INVALID_QUANTITY",
      });
    }
    if (input.type === "LIMIT" && !input.limitPrice) {
      throw new AppError("VALIDATION", "Limit orders require a limit price", {
        subcode: "INVALID_LIMIT_PRICE",
      });
    }
    if (input.type === "MARKET" && input.limitPrice) {
      throw new AppError("VALIDATION", "Market orders cannot carry a limit price", {
        subcode: "INVALID_LIMIT_PRICE",
      });
    }
  }

  private async mustGet(tx: TxHandle, id: string): Promise<Order> {
    const order = await this.repo.getById(tx, id);
    invariant(order, `order ${id} vanished mid-transaction`);
    return order;
  }

  getById(tx: TxHandle, id: string): Promise<Order | null> {
    return this.repo.getById(tx, id);
  }

  getByIdForUpdate(tx: TxHandle, id: string): Promise<Order | null> {
    return this.repo.getByIdForUpdate(tx, id);
  }

  list(tx: TxHandle, accountId: string, openOnly: boolean, limit = 100): Promise<Order[]> {
    return this.repo.listForAccount(tx, accountId, openOnly, limit);
  }

  listEvents(tx: TxHandle, orderId: string): Promise<OrderEventRecord[]> {
    return this.repo.listEvents(tx, orderId);
  }
}
