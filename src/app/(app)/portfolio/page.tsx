"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Money } from "@/components/finance/Money";
import { SymbolLogo } from "@/components/finance/SymbolLogo";
import { PriceChange } from "@/components/finance/PriceChange";
import { LiveEmptyState } from "@/components/live-preview";
import { useTradingMode } from "@/components/trading-mode";
import { api } from "@/lib/api";
import { formatPrice, formatPrice4, formatTime } from "@/lib/format";

export default function PortfolioPage() {
  const mode = useTradingMode();
  const { data, isPending, isError } = useQuery({
    queryKey: ["portfolio"],
    queryFn: api.portfolio,
    refetchInterval: 30_000,
    enabled: mode === "paper",
  });

  // Live preview shows live's own empty state — paper holdings never
  // re-badge as live (ADR-011).
  if (mode === "live") {
    return (
      <LiveEmptyState
        heading="Portfolio"
        body="No live positions — your live portfolio starts after your first deposit."
      />
    );
  }

  if (isPending) return <div className="skeleton" style={{ height: 240 }} />;
  if (isError || !data) {
    return <div className="empty-state">Portfolio could not be loaded. Retry shortly.</div>;
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <header>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Portfolio</h1>
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          Valuations as of {formatTime(data.summary.asOf)} · market {data.market.status}
        </p>
      </header>

      <section
        aria-label="Summary"
        className="field-panel tabular"
        style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-5) var(--space-7)" }}
      >
        <div>
          <div className="field-label">Equity</div>
          <div style={{ fontSize: "var(--text-hero)", fontWeight: 600 }}>
            <Money value={data.summary.equity} />
          </div>
        </div>
        <div>
          <div className="field-label">Cash</div>
          <Money value={data.summary.cash} />
        </div>
        <div>
          <div className="field-label">Positions value</div>
          <Money value={data.summary.positionsValue} />
        </div>
        <div>
          <div className="field-label">Realized P&L</div>
          <PriceChange amount={data.summary.realizedPnl} />
        </div>
      </section>

      {data.positions.length === 0 ? (
        <div className="empty-state">
          No positions. <Link href="/markets">Find an instrument</Link> to get started.
        </div>
      ) : (
        <table className="data-table collapsible">
          <caption className="sr-only">Positions</caption>
          <thead>
            <tr>
              <th scope="col">Symbol</th>
              <th scope="col" className="num">
                Qty
              </th>
              <th scope="col" className="num">
                Avg cost
              </th>
              <th scope="col" className="num">
                Last
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
            {data.positions.map((p) => (
              <tr key={p.symbol}>
                <td>
                  <span
                    style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}
                  >
                    <SymbolLogo symbol={p.symbol} />
                    <Link href={`/i/${p.symbol}`}>{p.symbol}</Link>
                  </span>
                </td>
                <td className="num tabular" data-cell="secondary">
                  {p.qty}
                </td>
                <td className="num tabular" data-cell="secondary" title={formatPrice4(p.avgCost)}>
                  {formatPrice(p.avgCost)}
                </td>
                <td className="num tabular">{p.lastPrice ? formatPrice(p.lastPrice) : "—"}</td>
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
      )}
    </div>
  );
}
