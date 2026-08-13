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

export function translateTradeEvent(raw: AlpacaTradeEvent): CanonicalBrokerEvent {
  const type = EVENT_MAP[raw.event] ?? "UNKNOWN_VENDOR_STATUS";
  const isFill = type === "ORDER_PARTIALLY_FILLED" || type === "ORDER_FILLED";
  const occurredAt = new Date(raw.timestamp ?? raw.at ?? Date.now());
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
          fillPrice: Px.fromString(Number(raw.price).toFixed(4)),
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
}

/** FILL activity from GET /v1/accounts/{id}/activities/FILL — carries the
 *  SAME execution ids as the stream, which is what keeps reconciliation
 *  imports exactly-once against stream deliveries (invariant 10). */
export interface AlpacaFillActivity {
  id: string; // activity id
  execution_id?: string;
  order_id: string;
  transaction_time: string;
  price: string;
  qty: string;
  side: string;
  type: string; // "fill" | "partial_fill"
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

  for (let i = 0; i < orderFills.length; i++) {
    const fill = orderFills[i]!;
    const isLast = i === orderFills.length - 1;
    const type: CanonicalEventType =
      isLast && order.status === "filled" ? "ORDER_FILLED" : "ORDER_PARTIALLY_FILLED";
    const executionId = fill.execution_id ?? fill.id;
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
      fillPrice: Px.fromString(Number(fill.price).toFixed(4)),
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
