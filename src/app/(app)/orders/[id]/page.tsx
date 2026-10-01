"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";
import { BackAppBar } from "@/components/BackAppBar";
import { Explainer } from "@/components/Explainer";
import { FillProgress } from "@/components/finance/FillProgress";
import { Money } from "@/components/finance/Money";
import { OrderStatusBadge } from "@/components/finance/OrderStatusBadge";
import {
  humanizeCode,
  isCancellable,
  isOrderTerminal,
  orderEventChip,
} from "@/components/finance/order-state";
import {
  orderProgressSignature,
  useRefreshOnOrderProgress,
} from "@/components/finance/order-queries";
import { useCancelOrder } from "@/components/finance/useCancelOrder";
import { Icon } from "@/components/icons/Icon";
import { EmptyCard, ErrorCard, showError } from "@/components/states";
import { api, ApiError } from "@/lib/api";
import {
  formatDateTime,
  formatOrderType,
  formatPrice,
  formatPrice4,
  formatShares,
} from "@/lib/format";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const cancel = useCancelOrder();
  const query = useQuery({
    queryKey: ["order", id],
    queryFn: () => api.orderDetail(id),
    // a missing order stays missing — no retry storm on a 404
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 3,
    refetchInterval: (q) => {
      if (q.state.error instanceof ApiError && q.state.error.status === 404) return false;
      const order = q.state.data?.order;
      return order && isOrderTerminal(order.state) ? false : 2_000;
    },
  });
  // A fill or final state seen here refreshes the cash/position views.
  useRefreshOnOrderProgress(orderProgressSignature(query.data ? [query.data.order] : undefined));

  if (query.isPending) {
    return (
      <div aria-busy="true" role="status" aria-label="Loading order">
        <div className="ar-skel" style={{ height: 240, borderRadius: "var(--radius-card)" }} />
      </div>
    );
  }
  if (showError(query) || !query.data) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(0, 1fr)",
          maxWidth: "44rem",
        }}
      >
        <BackAppBar href="/orders" backLabel="Back to orders" title="Order" />
        {notFound ? (
          <EmptyCard
            title="Order not found"
            message="It may belong to another account, or the link is incomplete."
            action={
              <Link href="/orders" className="ar-btn ar-btn--primary ar-btn--compact">
                Back to orders
              </Link>
            }
          />
        ) : (
          <ErrorCard
            message="This order couldn't be loaded."
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        )}
      </div>
    );
  }

  const { order, events, fills } = query.data;
  const canCancel = isCancellable(order.state);

  return (
    <div
      style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr)", maxWidth: "44rem" }}
    >
      <BackAppBar
        href="/orders"
        backLabel="Back to orders"
        title={`${order.side === "BUY" ? "Buy" : "Sell"} ${order.qty} ${order.symbol}`}
        trailing={<OrderStatusBadge state={order.state} display={order.stateDisplay} />}
      />

      <Explainer topic="lifecycle" />

      <div className="ar-card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        <div className="ar-ticket-row">
          <span className="ar-ticket-row__label">Order type</span>
          <span className="ar-ticket-row__value">
            {formatOrderType(order.type, order.limitPrice)} · day
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
              className="ar-btn ar-btn--secondary"
              disabled={cancel.pendingId === order.id}
              onClick={() => cancel.cancel(order.id)}
            >
              {cancel.pendingId === order.id ? "Cancelling…" : "Cancel order"}
            </button>
          </div>
          <p className="ar-caption ar-tertiary" style={{ margin: 0 }}>
            Cancelling asks the venue to stop the order. Shares that already filled stay filled.
          </p>
        </div>
      ) : null}
      {cancel.failedId === order.id && cancel.errorMessage ? (
        <p role="alert" className="field-error" style={{ margin: 0 }}>
          {cancel.errorMessage}
        </p>
      ) : null}

      <section aria-labelledby="order-fills-heading">
        <div className="ar-section">
          <h2 className="ar-heading" id="order-fills-heading">
            Fills
          </h2>
        </div>
        {fills.length === 0 ? (
          <EmptyCard message="No executions yet." />
        ) : (
          <ul className="ar-card ar-card--list ar-list" style={{ listStyle: "none", margin: 0 }}>
            {fills.map((f, i) => (
              <li key={`${f.occurredAt}-${i}`} className="ar-row">
                <span className="ar-chipicon ar-chipicon--gain" aria-hidden>
                  <Icon name="check" />
                </span>
                <div className="ar-row__main">
                  <span className="ar-row__title">
                    {formatShares(f.qty)} at{" "}
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
          Execution prices come from the paper venue and may differ from displayed quotes. That is
          expected, not an error.
        </p>
      </section>

      <section aria-labelledby="order-timeline-heading">
        <div className="ar-section">
          <h2 className="ar-heading" id="order-timeline-heading">
            Timeline
          </h2>
        </div>
        <ol className="ar-card ar-card--list ar-list" style={{ listStyle: "none", margin: 0 }}>
          {events.map((e, i) => {
            const { cls, icon } = orderEventChip(e.type);
            return (
              <li key={`${e.occurredAt}-${i}`} className="ar-row">
                <span className={`ar-chipicon ar-chipicon--sm ${cls}`} aria-hidden>
                  <Icon name={icon} />
                </span>
                <div className="ar-row__main">
                  <span className="ar-row__title">{humanizeCode(e.type)}</span>
                  <span className="ar-row__sub">
                    {humanizeCode(e.source)} · {formatDateTime(e.occurredAt)}
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
