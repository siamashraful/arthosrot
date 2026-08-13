"use client";

import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import { OrderStatusBadge } from "@/components/finance/OrderStatusBadge";
import { Money } from "@/components/finance/Money";
import { api } from "@/lib/api";
import { formatDateTime, formatPrice, formatPrice4 } from "@/lib/format";

const TERMINAL = new Set(["FILLED", "CANCELLED", "REJECTED", "EXPIRED", "SUBMIT_FAILED"]);

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isPending, isError } = useQuery({
    queryKey: ["order", id],
    queryFn: () => api.orderDetail(id),
    refetchInterval: (query) =>
      query.state.data && TERMINAL.has(query.state.data.order.state) ? false : 2_000,
  });

  if (isPending) return <div className="skeleton" style={{ height: 240 }} />;
  if (isError || !data) return <div className="empty-state">Order not found.</div>;

  const { order, events, fills } = data;

  return (
    <div style={{ display: "grid", gap: "var(--space-5)", maxWidth: "44rem" }}>
      <header style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
        <h1 style={{ fontSize: "var(--text-xl)" }}>
          {order.side === "BUY" ? "Buy" : "Sell"} {order.qty} {order.symbol}
        </h1>
        <OrderStatusBadge state={order.state} display={order.stateDisplay} />
      </header>

      <dl
        className="tabular card"
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "var(--space-2) var(--space-5)",
          margin: 0,
        }}
      >
        <dt className="muted">Type</dt>
        <dd style={{ margin: 0 }}>
          {order.type === "MARKET" ? "Market" : `Limit ${formatPrice(order.limitPrice ?? "")}`} ·
          DAY
        </dd>
        <dt className="muted">Filled</dt>
        <dd style={{ margin: 0 }}>
          {order.filledQty} of {order.qty}
        </dd>
        <dt className="muted">Placed</dt>
        <dd style={{ margin: 0 }}>{formatDateTime(order.createdAt)}</dd>
        <dt className="muted">Order id</dt>
        <dd style={{ margin: 0 }} className="mono">
          {order.id}
        </dd>
        {order.rejectReason ? (
          <>
            <dt className="muted">Venue reason</dt>
            <dd style={{ margin: 0 }}>{order.rejectReason}</dd>
          </>
        ) : null}
      </dl>

      <section aria-label="Fills">
        <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-3)" }}>Fills</h2>
        {fills.length === 0 ? (
          <div className="empty-state">No executions yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col" className="num">
                  Qty
                </th>
                <th scope="col" className="num">
                  Price
                </th>
                <th scope="col" className="num">
                  Notional
                </th>
                <th scope="col">Time</th>
              </tr>
            </thead>
            <tbody>
              {fills.map((f, i) => (
                <tr key={i}>
                  <td className="num tabular">{f.qty}</td>
                  <td className="num tabular" title={formatPrice4(f.price)}>
                    {formatPrice(f.price)}
                  </td>
                  <td className="num">
                    <Money value={f.notional} />
                  </td>
                  <td>{formatDateTime(f.occurredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
          Execution prices come from the paper venue and may differ from displayed quotes — that is
          expected, not an error.
        </p>
      </section>

      <section aria-label="Event timeline">
        <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-3)" }}>Timeline</h2>
        <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
          {events.map((e, i) => (
            <li key={i} style={{ padding: "var(--space-1) 0" }}>
              <span className="mono" style={{ fontSize: "var(--text-xs)" }}>
                {e.type}
              </span>{" "}
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                · {e.source} · {formatDateTime(e.occurredAt)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
