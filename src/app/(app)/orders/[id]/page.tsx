"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, Clock, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { Explainer } from "@/components/Explainer";
import { OrderStatusBadge } from "@/components/finance/OrderStatusBadge";
import { FillProgress } from "@/components/finance/FillProgress";
import { Money } from "@/components/finance/Money";
import { isCancellable } from "@/components/finance/OrdersTable";
import { useCancelOrder } from "@/components/finance/useCancelOrder";
import { api } from "@/lib/api";
import { formatDateTime, formatPrice, formatPrice4 } from "@/lib/format";

const TERMINAL = new Set(["FILLED", "CANCELLED", "REJECTED", "EXPIRED", "SUBMIT_FAILED"]);

/** Semantic chip for a lifecycle event, by what the event did. */
function eventChip(type: string): { cls: string; Icon: typeof Check } {
  if (type.includes("FILL")) return { cls: "ar-chipicon--gain", Icon: Check };
  if (type.includes("REJECT") || type.includes("FAIL"))
    return { cls: "ar-chipicon--loss", Icon: TriangleAlert };
  if (type.includes("CANCEL") || type.includes("EXPIRE"))
    return { cls: "ar-chipicon--neutral", Icon: X };
  // still in flight: the same Pending treatment the orders list uses
  return { cls: "ar-chipicon--warning", Icon: Clock };
}

/** "PARTIALLY_FILLED" → "Partially filled": event names read as words, not codes. */
function humanize(code: string): string {
  const words = code.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const cancel = useCancelOrder();
  const { data, isPending, isError } = useQuery({
    queryKey: ["order", id],
    queryFn: () => api.orderDetail(id),
    refetchInterval: (query) =>
      query.state.data && TERMINAL.has(query.state.data.order.state) ? false : 2_000,
  });

  if (isPending) {
    return (
      <div aria-busy="true" role="status" aria-label="Loading order">
        <div className="ar-skel" style={{ height: 240, borderRadius: "var(--radius-card)" }} />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="ar-card">
        <div className="ar-empty">
          <span className="ar-empty__title">Order not found</span>
          <Link href="/orders" className="ar-btn ar-btn--primary">
            Back to orders
          </Link>
        </div>
      </div>
    );
  }

  const { order, events, fills } = data;
  const canCancel = isCancellable(order.state);

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: "44rem" }}>
      <div className="ar-appbar">
        <Link
          href="/orders"
          className="ar-btn ar-btn--icon ar-btn--plain"
          aria-label="Back to orders"
        >
          <ChevronLeft aria-hidden />
        </Link>
        <h1 className="ar-appbar__title">
          {order.side === "BUY" ? "Buy" : "Sell"} {order.qty} {order.symbol}
        </h1>
        <OrderStatusBadge state={order.state} display={order.stateDisplay} />
      </div>

      <Explainer topic="lifecycle" />

      <div className="ar-card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        <div className="ar-ticket-row">
          <span className="ar-ticket-row__label">Order type</span>
          <span className="ar-ticket-row__value">
            {order.type === "MARKET" ? "Market" : `Limit ${formatPrice(order.limitPrice ?? "")}`} ·
            day
          </span>
        </div>
        <div className="ar-ticket-row">
          <span className="ar-ticket-row__label">Filled</span>
          <span className="ar-ticket-row__value">
            <FillProgress filledQty={order.filledQty} qty={order.qty} />
            {order.filledQty} of {order.qty}
          </span>
        </div>
        <div className="ar-ticket-row">
          <span className="ar-ticket-row__label">Placed</span>
          <span className="ar-ticket-row__value">{formatDateTime(order.createdAt)}</span>
        </div>
        <div className="ar-ticket-row">
          <span className="ar-ticket-row__label">Order id</span>
          <span className="ar-ticket-row__value ar-caption" style={{ wordBreak: "break-all" }}>
            {order.id}
          </span>
        </div>
        {order.rejectReason ? (
          <div className="ar-ticket-row">
            <span className="ar-ticket-row__label">Venue reason</span>
            <span className="ar-ticket-row__value">{order.rejectReason}</span>
          </div>
        ) : null}
      </div>

      {canCancel ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <button
              type="button"
              className="btn btn-danger"
              disabled={cancel.pendingId === order.id}
              onClick={() => cancel.cancel(order.id)}
            >
              {cancel.pendingId === order.id ? "Cancelling…" : "Cancel order"}
            </button>
          </div>
          <p className="ar-caption ar-tertiary" style={{ margin: 0 }}>
            Cancelling asks the venue to stop the order. Shares that already filled stay filled.
          </p>
          {cancel.failedId === order.id && cancel.errorMessage ? (
            <p role="alert" className="field-error" style={{ margin: 0 }}>
              {cancel.errorMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      <section aria-label="Fills">
        <div className="ar-section">
          <h2 className="ar-heading">Fills</h2>
        </div>
        {fills.length === 0 ? (
          <div className="ar-card">
            <div className="ar-empty">
              <span className="ar-empty__text">No executions yet.</span>
            </div>
          </div>
        ) : (
          <ul className="ar-card ar-card--list ar-list" style={{ listStyle: "none", margin: 0 }}>
            {fills.map((f, i) => (
              <li key={i} className="ar-row">
                <span className="ar-chipicon ar-chipicon--gain" aria-hidden>
                  <Check />
                </span>
                <div className="ar-row__main">
                  <span className="ar-row__title">
                    {f.qty} {f.qty === "1" ? "share" : "shares"} at{" "}
                    <span title={formatPrice4(f.price)}>{formatPrice(f.price)}</span>
                  </span>
                  <span className="ar-row__sub">{formatDateTime(f.occurredAt)}</span>
                </div>
                <div className="ar-row__end">
                  <span className="ar-row__value">
                    <Money value={f.notional} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="ar-caption ar-tertiary" style={{ margin: "8px 0 0" }}>
          Execution prices come from the paper venue and may differ from displayed quotes — that is
          expected, not an error.
        </p>
      </section>

      <section aria-label="Event timeline">
        <div className="ar-section">
          <h2 className="ar-heading">Timeline</h2>
        </div>
        <ol className="ar-card ar-card--list ar-list" style={{ listStyle: "none", margin: 0 }}>
          {events.map((e, i) => {
            const { cls, Icon } = eventChip(e.type);
            return (
              <li key={i} className="ar-row">
                <span className={`ar-chipicon ar-chipicon--sm ${cls}`} aria-hidden>
                  <Icon />
                </span>
                <div className="ar-row__main">
                  <span className="ar-row__title">{humanize(e.type)}</span>
                  <span className="ar-row__sub">
                    {e.source} · {formatDateTime(e.occurredAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
