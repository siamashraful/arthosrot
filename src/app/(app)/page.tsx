"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { OrdersTable } from "@/components/finance/OrdersTable";
import { Money } from "@/components/finance/Money";
import { PriceChange } from "@/components/finance/PriceChange";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/format";

export default function DashboardPage() {
  const { data: portfolio, isPending } = useQuery({
    queryKey: ["portfolio"],
    queryFn: api.portfolio,
    refetchInterval: 30_000,
  });
  const { data: watchlist } = useQuery({
    queryKey: ["watchlist"],
    queryFn: api.watchlist,
    refetchInterval: 15_000,
  });

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <header>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Dashboard</h1>
      </header>

      {isPending || !portfolio ? (
        <div className="skeleton" style={{ height: 72 }} />
      ) : (
        <section
          aria-label="Account summary"
          className="tabular"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-5) var(--space-7)",
            alignItems: "baseline",
          }}
        >
          <div>
            <div className="field-label">Portfolio value</div>
            <div style={{ fontSize: "var(--text-hero)", fontWeight: 600 }}>
              <Money value={portfolio.summary.equity} />
            </div>
            <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
              as of {formatTime(portfolio.summary.asOf)} · market {portfolio.market.status}
            </div>
          </div>
          <div>
            <div className="field-label">Cash</div>
            <div style={{ fontSize: "var(--text-md)" }}>
              <Money value={portfolio.summary.cash} />
            </div>
          </div>
          <div>
            <div className="field-label">Buying power</div>
            <div style={{ fontSize: "var(--text-md)" }}>
              <Money value={portfolio.summary.buyingPower} />
            </div>
          </div>
          <div>
            <div className="field-label">Realized P&L</div>
            <div style={{ fontSize: "var(--text-md)" }}>
              <PriceChange amount={portfolio.summary.realizedPnl} />
            </div>
          </div>
        </section>
      )}

      {portfolio && portfolio.positions.length === 0 ? (
        <div className="empty-state">
          <p style={{ marginTop: 0 }}>No positions yet.</p>
          <p style={{ marginBottom: 0 }}>
            <Link href="/markets">Search a symbol</Link> to place your first paper trade.
          </p>
        </div>
      ) : null}

      {portfolio && portfolio.positions.length > 0 ? (
        <section aria-label="Top positions">
          <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-3)" }}>Positions</h2>
          <table className="data-table collapsible">
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col" className="num">
                  Qty
                </th>
                <th scope="col" className="num">
                  Market value
                </th>
                <th scope="col" className="num">
                  Unrealized P&L
                </th>
              </tr>
            </thead>
            <tbody>
              {portfolio.positions.slice(0, 5).map((p) => (
                <tr key={p.symbol}>
                  <td>
                    <Link href={`/i/${p.symbol}`}>{p.symbol}</Link>
                  </td>
                  <td className="num tabular" data-cell="secondary">
                    {p.qty}
                  </td>
                  <td className="num">
                    <Money value={p.marketValue} />
                  </td>
                  <td className="num">
                    <PriceChange amount={p.unrealizedPnl} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginBottom: 0 }}>
            <Link href="/portfolio">Full portfolio →</Link>
          </p>
        </section>
      ) : null}

      <section aria-label="Watchlist">
        <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-3)" }}>Watchlist</h2>
        {!watchlist || watchlist.items.length === 0 ? (
          <div className="empty-state">
            Add symbols from an <Link href="/markets">instrument page</Link> to track them here.
          </div>
        ) : (
          <table className="data-table collapsible">
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col" className="num">
                  Last
                </th>
              </tr>
            </thead>
            <tbody>
              {watchlist.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/i/${item.symbol}`}>{item.symbol}</Link>{" "}
                    <span className="muted" data-cell="secondary">
                      {item.name}
                    </span>
                  </td>
                  <td className="num tabular">{item.quote ? `$${item.quote.last}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="Open orders">
        <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-3)" }}>Open orders</h2>
        <OrdersTable status="open" limit={5} />
      </section>
    </div>
  );
}
