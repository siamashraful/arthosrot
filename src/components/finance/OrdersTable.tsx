"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { api, type OrderDto } from "@/lib/api";
import { formatDateTime, formatPrice } from "@/lib/format";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { FillProgress } from "./FillProgress";

const OPEN = new Set([
  "PENDING_SUBMISSION",
  "ACKNOWLEDGED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "CANCEL_PENDING",
]);

/** Semantic chip for an order's state: icon plus tint, mirrored by the status tag's word. */
function stateChip(state: string): { cls: string; Icon: typeof Check } {
  if (state === "FILLED") return { cls: "ar-chipicon--gain", Icon: Check };
  if (state === "REJECTED" || state === "SUBMIT_FAILED")
    return { cls: "ar-chipicon--loss", Icon: TriangleAlert };
  if (OPEN.has(state)) return { cls: "ar-chipicon--warning", Icon: Clock };
  return { cls: "ar-chipicon--neutral", Icon: X };
}

/**
 * Orders list with adaptive polling (ADR-010): 2s while any order is open,
 * paused otherwise — order status advances without manual refresh. Rendered
 * as the system's activity rows on a list card.
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

  if (isPending) {
    return (
      <div className="ar-card ar-card--list" aria-busy="true">
        <div className="ar-skel-row">
          <span className="ar-skel ar-skel--chip" />
          <div className="ar-skel-row__main">
            <span className="ar-skel ar-skel--text" style={{ width: "40%" }} />
            <span className="ar-skel ar-skel--text" style={{ width: "60%" }} />
          </div>
        </div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="ar-card">
        <div className="ar-empty">
          <span className="ar-empty__text">Orders could not be loaded. Retry shortly.</span>
        </div>
      </div>
    );
  }

  const orders = (data?.orders ?? []).slice(0, limit);
  if (orders.length === 0) {
    return (
      <div className="ar-card">
        <div className="ar-empty">
          <span className="ar-empty__text">
            {status === "open" ? "No open orders." : "No orders yet — search a symbol to trade."}
          </span>
        </div>
      </div>
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
        <OrderRow key={order.id} order={order} onCancel={(id) => cancel.mutate(id)} />
      ))}
    </ul>
  );
}

function OrderRow({ order, onCancel }: { order: OrderDto; onCancel: (id: string) => void }) {
  const cancellable = OPEN.has(order.state) && order.state !== "PENDING_SUBMISSION";
  const { cls, Icon } = stateChip(order.state);
  return (
    <li className="ar-row">
      <span className={`ar-chipicon ${cls}`} aria-hidden>
        <Icon size={22} />
      </span>
      <div className="ar-row__main">
        <span className="ar-row__title">
          <Link href={`/orders/${order.id}`}>
            {order.side === "BUY" ? "Buy" : "Sell"} {order.qty} {order.symbol}
          </Link>
        </span>
        <span className="ar-row__sub">
          {order.type === "MARKET" ? "Market" : `Limit ${formatPrice(order.limitPrice ?? "")}`} ·{" "}
          {formatDateTime(order.createdAt)}
        </span>
        <span>
          <OrderStatusBadge state={order.state} display={order.stateDisplay} />
        </span>
      </div>
      <div className="ar-row__end">
        <span className="ar-row__value">
          <FillProgress filledQty={order.filledQty} qty={order.qty} /> {order.filledQty}/{order.qty}
        </span>
        {cancellable ? (
          <button
            type="button"
            className="btn btn-danger ar-btn--compact"
            onClick={() => onCancel(order.id)}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </li>
  );
}
