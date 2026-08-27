import type { Money, Px, Qty } from "../money";
import type { BrokerKindId } from "../accounts";

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type TimeInForce = "DAY";

export type OrderState =
  | "PENDING_SUBMISSION"
  | "ACKNOWLEDGED"
  | "ACCEPTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCEL_PENDING"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED"
  | "SUBMIT_FAILED";

export const TERMINAL_STATES: ReadonlySet<OrderState> = new Set([
  "FILLED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
  "SUBMIT_FAILED",
]);

export const OPEN_STATES: ReadonlySet<OrderState> = new Set([
  "PENDING_SUBMISSION",
  "ACKNOWLEDGED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "CANCEL_PENDING",
]);

/** UI display labels (docs/architecture/EXECUTION.md state table). */
export const STATE_DISPLAY: Record<OrderState, string> = {
  PENDING_SUBMISSION: "Pending",
  ACKNOWLEDGED: "Open",
  ACCEPTED: "Open",
  PARTIALLY_FILLED: "Partially filled",
  FILLED: "Filled",
  CANCEL_PENDING: "Cancelling",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  SUBMIT_FAILED: "Failed to submit",
};

export interface Order {
  id: string;
  accountId: string;
  instrumentId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  tif: TimeInForce;
  qty: Qty;
  limitPrice: Px | null;
  state: OrderState;
  filledQty: Qty;
  reservedCash: Money;
  rejectReason: string | null;
  needsAttention: boolean;
  idempotencyKey: string;
  broker: BrokerKindId | null;
  brokerOrderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function remainingQty(order: Order): Qty {
  return order.qty.subtract(order.filledQty);
}

export type OrderEventSource = "broker" | "local" | "inferred" | "reconciliation";

export type CanonicalEventType =
  | "ORDER_ACKNOWLEDGED"
  | "ORDER_ACCEPTED"
  | "ORDER_PARTIALLY_FILLED"
  | "ORDER_FILLED"
  | "ORDER_CANCEL_PENDING"
  | "ORDER_CANCELLED"
  | "ORDER_REJECTED"
  | "ORDER_EXPIRED"
  | "ORDER_SUBMIT_FAILED"
  | "UNKNOWN_VENDOR_STATUS";

/**
 * Vendor-neutral broker event (docs/architecture/EXECUTION.md). The ONLY input
 * that mutates execution-derived financial state.
 */
export interface CanonicalBrokerEvent {
  type: CanonicalEventType;
  broker: BrokerKindId;
  brokerAccountId: string;
  brokerOrderId: string | null;
  /** = Arthosrot order id (venue-level idempotency key). */
  clientOrderId: string;
  /** Stable per-event id (ULID at Alpaca); null for local/synthesized events. */
  externalEventId: string | null;
  /** Per-execution id — present exactly on fill events. */
  executionId?: string;
  fillQty?: Qty;
  fillPrice?: Px;
  fee?: Money;
  occurredAt: Date;
  raw?: unknown;
}
