"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Money } from "@/components/finance/Money";
import { SymbolLogo } from "@/components/finance/SymbolLogo";
import { PriceChange } from "@/components/finance/PriceChange";
import { MetricIcon } from "@/components/finance/MetricIcon";
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

  if (isPending) {
    return (
      <div
        aria-busy="true"
        role="status"
        aria-label="Loading portfolio"
        style={{ display: "grid", gap: 16 }}
      >
        <div className="ar-skel" style={{ height: 140, borderRadius: "var(--radius-hero)" }} />
        <div className="ar-skel" style={{ height: 200, borderRadius: "var(--radius-card)" }} />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="ar-card">
        <div className="ar-empty">
          <span className="ar-empty__text">Portfolio could not be loaded. Retry shortly.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="ar-appbar">
        <div className="ar-appbar__title">
          <h1 className="ar-title">Portfolio</h1>
          <p className="ar-caption ar-tertiary" style={{ margin: 0 }}>
            Valuations as of {formatTime(data.summary.asOf)} · market {data.market.status}
          </p>
        </div>
      </div>

      <section aria-label="Summary" className="ar-hero">
        <span className="ar-hero__label">Equity</span>
        <span className="ar-hero__value">
          <Money value={data.summary.equity} />
        </span>
        <span className="ar-hero__delta">Cash and positions, valued at the last quote</span>
      </section>

      <div className="ar-insight-row">
        <div className="ar-insight">
          <span className="ar-insight__head">
            <MetricIcon type="cash" />
            Cash
          </span>
          <span className="ar-insight__value">
            <Money value={data.summary.cash} />
          </span>
        </div>
        <div className="ar-insight">
          <span className="ar-insight__head">
            <MetricIcon type="positions" />
            Positions value
          </span>
          <span className="ar-insight__value">
            <Money value={data.summary.positionsValue} />
          </span>
        </div>
        <div className="ar-insight">
          <span className="ar-insight__head">
            <MetricIcon type="realized" />
            Realized P&L
          </span>
          <span className="ar-insight__value">
            <PriceChange amount={data.summary.realizedPnl} />
          </span>
        </div>
      </div>

      <div className="ar-section">
        <h2 className="ar-heading">Holdings</h2>
      </div>
      {data.positions.length === 0 ? (
        <div className="ar-card">
          <div className="ar-empty">
            <span className="ar-empty__title">No positions</span>
            <span className="ar-empty__text">Find an instrument to get started.</span>
            <Link href="/markets" className="ar-btn ar-btn--primary">
              Search markets
            </Link>
          </div>
        </div>
      ) : (
        <div className="ar-card ar-card--list">
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
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <SymbolLogo symbol={p.symbol} size={24} />
                      <Link href={`/i/${p.symbol}`} className="ar-body-strong">
                        {p.symbol}
                      </Link>
                    </span>
                  </td>
                  <td className="num tabular" data-cell="secondary">
                    {p.qty} {p.qty === "1" ? "share" : "shares"}
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
        </div>
      )}
    </div>
  );
}
