"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api, type OrderDto } from "@/lib/api";
import { formatDateTime, formatPrice } from "@/lib/format";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { WeaveFill } from "./WeaveFill";

const OPEN = new Set([
  "PENDING_SUBMISSION",
  "ACKNOWLEDGED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "CANCEL_PENDING",
]);

/**
 * Orders list with adaptive polling (ADR-010): 2s while any order is open,
 * paused otherwise — order status advances without manual refresh.
 */
export function OrdersTable({ status, limit }: { status: "open" | "all"; limit?: number }) {
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: ["orders", status],
    queryFn: () => api.orders(status),
    refetchInterval: (query) => {
      const orders = query.state.data?.orders ?? [];
      return orders.some((o) => OPEN.has(o.state)) ? 2_000 : false;
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelOrder(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });

  if (isPending) return <div className="skeleton" style={{ height: 120 }} />;
  if (isError) return <div className="empty-state">Orders could not be loaded. Retry shortly.</div>;

  const orders = (data?.orders ?? []).slice(0, limit);
  if (orders.length === 0) {
    return (
      <div className="empty-state">
        {status === "open" ? "No open orders." : "No orders yet — search a symbol to trade."}
      </div>
    );
  }

  return (
    <table className="data-table collapsible" aria-live="polite">
      <caption className="sr-only">{status === "open" ? "Open orders" : "Order history"}</caption>
      <thead>
        <tr>
          <th scope="col">Order</th>
          <th scope="col">Type</th>
          <th scope="col" className="num">
            Filled
          </th>
          <th scope="col">Status</th>
          <th scope="col">Placed</th>
          <th scope="col" aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <OrderRow key={order.id} order={order} onCancel={(id) => cancel.mutate(id)} />
        ))}
      </tbody>
    </table>
  );
}

function OrderRow({ order, onCancel }: { order: OrderDto; onCancel: (id: string) => void }) {
  const cancellable = OPEN.has(order.state) && order.state !== "PENDING_SUBMISSION";
  return (
    <tr>
      <td>
        <Link href={`/orders/${order.id}`}>
          {order.side === "BUY" ? "Buy" : "Sell"} {order.qty} {order.symbol}
        </Link>
      </td>
      <td data-cell="secondary">
        {order.type === "MARKET" ? "Market" : `Limit ${formatPrice(order.limitPrice ?? "")}`}
      </td>
      <td className="num tabular" data-cell="secondary">
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
          <WeaveFill filledQty={order.filledQty} qty={order.qty} />
          {order.filledQty}/{order.qty}
        </span>
      </td>
      <td>
        <OrderStatusBadge state={order.state} display={order.stateDisplay} />
      </td>
      <td data-cell="secondary" className="muted">
        {formatDateTime(order.createdAt)}
      </td>
      <td className="num">
        {cancellable ? (
          <button type="button" className="btn btn-danger" onClick={() => onCancel(order.id)}>
            Cancel
          </button>
        ) : null}
      </td>
    </tr>
  );
}
