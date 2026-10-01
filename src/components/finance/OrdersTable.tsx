"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { EmptyCard, ErrorCard, SkeletonRows, showError } from "@/components/states";
import { api, type OrderDto } from "@/lib/api";
import { formatDateTime, formatOrderType } from "@/lib/format";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { FillProgress } from "./FillProgress";
import { isCancellable, isOrderOpen, orderStateChip } from "./order-state";
import {
  isNoActiveAccount,
  orderProgressSignature,
  useRefreshOnOrderProgress,
} from "./order-queries";
import { useCancelOrder } from "./useCancelOrder";

/**
 * Orders list with adaptive polling (ADR-010): 2s while any order is open,
 * paused otherwise — order status advances without manual refresh. Rendered
 * as the system's activity rows on a list card. A fill or state change seen
 * here refreshes every cash-derived view (order-queries.ts).
 */
export function OrdersTable({ status, limit }: { status: "open" | "all"; limit?: number }) {
  const query = useQuery({
    queryKey: ["orders", status],
    queryFn: () => api.orders(status),
    refetchInterval: (q) =>
      q.state.data?.orders.some((o) => isOrderOpen(o.state)) ? 2_000 : false,
  });
  useRefreshOnOrderProgress(orderProgressSignature(query.data?.orders));

  const cancel = useCancelOrder();

  if (query.isPending) return <SkeletonRows count={2} />;
  if (showError(query)) {
    if (isNoActiveAccount(query.error)) {
      return (
        <EmptyCard
          message="Open your practice account to place orders."
          action={
            <Link href="/" className="ar-btn ar-btn--primary ar-btn--compact">
              Go to dashboard
            </Link>
          }
        />
      );
    }
    return (
      <ErrorCard
        message="Orders couldn't be loaded."
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const orders = (query.data?.orders ?? []).slice(0, limit);
  if (orders.length === 0) {
    return (
      <EmptyCard
        message={status === "open" ? "No open orders." : "No orders yet. Search a symbol to trade."}
      />
    );
  }

  return (
    <ul
      className="ar-card ar-card--list ar-list"
      style={{ listStyle: "none", margin: 0 }}
      aria-live="polite"
      aria-label={status === "open" ? "Open orders" : "Order history"}
    >
      {orders.map((order) => (
        <OrderRow
          key={order.id}
          order={order}
          onCancel={cancel.cancel}
          cancelling={cancel.pendingId === order.id}
          cancelError={cancel.failedId === order.id ? cancel.errorMessage : null}
        />
      ))}
    </ul>
  );
}

function OrderRow({
  order,
  onCancel,
  cancelling,
  cancelError,
}: {
  order: OrderDto;
  onCancel: (id: string) => void;
  cancelling: boolean;
  cancelError: string | null;
}) {
  const { cls, icon } = orderStateChip(order.state);
  const sideWord = order.side === "BUY" ? "Buy" : "Sell";
  return (
    <li className="ar-row">
      <span className={`ar-chipicon ${cls}`} aria-hidden>
        <Icon name={icon} />
      </span>
      <div className="ar-row__main">
        <span className="ar-row__title">
          <Link href={`/orders/${order.id}`}>
            {sideWord} {order.qty} {order.symbol}
          </Link>
        </span>
        <span className="ar-row__sub">
          {formatOrderType(order.type, order.limitPrice)} · {formatDateTime(order.createdAt)}
        </span>
        <span>
          <OrderStatusBadge state={order.state} display={order.stateDisplay} />
        </span>
        {cancelError ? (
          <span role="alert" className="field-error">
            {cancelError}
          </span>
        ) : null}
      </div>
      <div className="ar-row__end">
        <span className="ar-row__value">
          <FillProgress filledQty={order.filledQty} qty={order.qty} /> {order.filledQty}/{order.qty}
        </span>
        {isCancellable(order.state) ? (
          <button
            type="button"
            className="ar-btn ar-btn--secondary ar-btn--compact"
            onClick={() => onCancel(order.id)}
            disabled={cancelling}
            aria-label={`Cancel ${sideWord.toLowerCase()} ${order.qty} ${order.symbol}`}
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        ) : null}
      </div>
    </li>
  );
}
