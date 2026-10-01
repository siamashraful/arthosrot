import { Money, Px, Qty } from "@/core/money";
import type { CanonicalBrokerEvent, CanonicalEventType } from "@/core/orders";

/**
 * Vendor -> canonical translation (ADR-005). Alpaca types/statuses never leave
 * this directory. Unknown/new vendor statuses map to UNKNOWN_VENDOR_STATUS —
 * persisted for audit, no transition, order flagged (EXECUTION.md policy).
 */

/** Trade-event payload from GET /v2/events/trades (SSE `data:` lines). */
export interface AlpacaTradeEvent {
  account_id: string;
  event_id: string; // ULID — replay cursor + idempotency key
  event: string; // vendor status string
  at?: string;
  timestamp?: string;
  execution_id?: string;
  price?: string;
  qty?: string;
  order: {
    id: string;
    client_order_id: string;
    status: string;
    filled_qty?: string;
  };
}

const EVENT_MAP: Record<string, CanonicalEventType> = {
  pending_new: "ORDER_ACKNOWLEDGED",
  accepted: "ORDER_ACCEPTED",
  new: "ORDER_ACCEPTED",
  partial_fill: "ORDER_PARTIALLY_FILLED",
  fill: "ORDER_FILLED",
  pending_cancel: "ORDER_CANCEL_PENDING",
  canceled: "ORDER_CANCELLED",
  cancelled: "ORDER_CANCELLED",
  rejected: "ORDER_REJECTED",
  expired: "ORDER_EXPIRED",
  done_for_day: "ORDER_EXPIRED",
};

/**
 * The event's own timestamp, or — when it is missing or unparseable — the
 * received-at time, logged. An Invalid Date would fail the apply and, with
 * the stream cursor never advancing past it, block every later event (a
 * poison message). Reconciliation stays the authority on order state.
 */
function eventTime(raw: AlpacaTradeEvent): Date {
  const stamp = raw.timestamp ?? raw.at;
  const at = typeof stamp === "string" ? new Date(stamp) : null;
  if (at && !Number.isNaN(at.getTime())) return at;
  console.error(
    JSON.stringify({
      level: "warn",
      msg: "alpaca trade event without a valid timestamp; using received-at time",
      eventId: raw.event_id,
      stamp: stamp ?? null,
    }),
  );
  return new Date();
}

export function translateTradeEvent(raw: AlpacaTradeEvent): CanonicalBrokerEvent {
  const type = EVENT_MAP[raw.event] ?? "UNKNOWN_VENDOR_STATUS";
  const isFill = type === "ORDER_PARTIALLY_FILLED" || type === "ORDER_FILLED";
  const occurredAt = eventTime(raw);
  return {
    type,
    broker: "ALPACA_PAPER",
    brokerAccountId: raw.account_id,
    brokerOrderId: raw.order.id,
    clientOrderId: raw.order.client_order_id,
    externalEventId: raw.event_id,
    occurredAt,
    raw,
    ...(isFill && raw.execution_id && raw.price && raw.qty
      ? {
          executionId: raw.execution_id,
          fillQty: Qty.of(raw.qty),
          fillPrice: Px.fromVendorDecimal(raw.price),
          fee: Money.zero(), // commission-free paper venue; fees stay configurable locally
        }
      : {}),
  };
}

/** Order snapshot from GET /v1/trading/accounts/{id}/orders... */
export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  status: string;
  filled_qty: string;
  submitted_at?: string;
}

/**
 * FILL activity from GET /v1/accounts/activities/FILL?account_id=… (Broker
 * API; the account id is a QUERY parameter — `/v1/accounts/{id}/activities`
 * does not exist and 404s). Verified against the sandbox 2026-09-30: the
 * activity's `execution_id` is null and its `id` is `<timestamp>::<uuid>`,
 * where the uuid IS the stream event's `execution_id`.
 */
export interface AlpacaFillActivity {
  id: string; // "20260903093003612::968ad49b-0f3a-4efa-afc6-0bb57f2b6ff8"
  execution_id?: string | null;
  order_id: string;
  transaction_time: string;
  price: string;
  qty: string;
  side: string;
  type: string; // "fill" | "partial_fill"
}

/**
 * The execution id a fill activity describes, in the SAME form the trade
 * stream reports it. Exactly-once across stream and reconciliation rests on
 * this (fills are unique on (broker, execution_id)): keying a reconciled fill
 * by the whole activity id would let one venue execution book twice if the
 * stream also delivered it.
 */
export function activityExecutionId(fill: AlpacaFillActivity): string {
  if (fill.execution_id) return fill.execution_id;
  const sep = fill.id.lastIndexOf("::");
  return sep >= 0 ? fill.id.slice(sep + 2) : fill.id;
}

/** Venue says the order has fills we cannot see — never report that as "in sync". */
export class IncompleteFillsError extends Error {
  constructor(orderId: string, venueFilled: string, visible: string) {
    super(
      `alpaca order ${orderId}: venue reports ${venueFilled} filled but only ${visible} visible in fill activities`,
    );
    this.name = "IncompleteFillsError";
  }
}

/**
 * Synthesize canonical events from a REST snapshot (reconciliation path):
 * per-execution fill events from activities + a terminal/non-fill status event
 * derived from the order status. Event ids are the venue's own ids, so replay
 * through the idempotent apply path double-applies nothing.
 */
export function eventsFromSnapshot(
  brokerAccountId: string,
  order: AlpacaOrder,
  fills: AlpacaFillActivity[],
): CanonicalBrokerEvent[] {
  const events: CanonicalBrokerEvent[] = [];
  const orderFills = fills
    .filter((f) => f.order_id === order.id)
    .sort((a, b) => a.transaction_time.localeCompare(b.transaction_time));

  // A filled order's executions MUST be visible: a "filled" status alone
  // carries no price/qty/execution id, so it can never be applied — and
  // silently skipping it would leave the order looking open forever while
  // reconciliation reports the account healthy. Fail loudly instead.
  const visible = orderFills.reduce((sum, f) => sum.add(Qty.of(f.qty)), Qty.of(0));
  const venueFilled = Qty.of(order.filled_qty || "0");
  if (!visible.gte(venueFilled)) {
    throw new IncompleteFillsError(order.id, venueFilled.toString(), visible.toString());
  }

  for (let i = 0; i < orderFills.length; i++) {
    const fill = orderFills[i]!;
    const isLast = i === orderFills.length - 1;
    const type: CanonicalEventType =
      isLast && order.status === "filled" ? "ORDER_FILLED" : "ORDER_PARTIALLY_FILLED";
    const executionId = activityExecutionId(fill);
    events.push({
      type,
      broker: "ALPACA_PAPER",
      brokerAccountId,
      brokerOrderId: order.id,
      clientOrderId: order.client_order_id,
      // Reconciliation-synthesized event envelope: keyed by execution id so a
      // prior stream delivery of the same execution dedupes at the fill layer.
      externalEventId: `recon-${executionId}`,
      executionId,
      fillQty: Qty.of(fill.qty),
      fillPrice: Px.fromVendorDecimal(fill.price),
      fee: Money.zero(),
      occurredAt: new Date(fill.transaction_time),
      raw: fill,
    });
  }

  const statusType = EVENT_MAP[order.status];
  if (statusType && statusType !== "ORDER_FILLED" && statusType !== "ORDER_PARTIALLY_FILLED") {
    events.push({
      type: statusType,
      broker: "ALPACA_PAPER",
      brokerAccountId,
      brokerOrderId: order.id,
      clientOrderId: order.client_order_id,
      externalEventId: `recon-status-${order.id}-${order.status}`,
      occurredAt: new Date(),
      raw: order,
    });
  }
  return events;
}
