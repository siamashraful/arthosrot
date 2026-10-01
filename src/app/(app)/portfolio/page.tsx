"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Money } from "@/components/finance/Money";
import { SymbolLogo } from "@/components/finance/SymbolLogo";
import { PriceChange } from "@/components/finance/PriceChange";
import { Icon } from "@/components/icons/Icon";
import { LiveEmptyState } from "@/components/live-preview";
import { EmptyCard, ErrorCard, showError } from "@/components/states";
import { useTradingMode } from "@/components/trading-mode";
import { api, ApiError } from "@/lib/api";
import {
  formatMarketStatus,
  formatPrice,
  formatPrice4,
  formatShares,
  formatTime,
} from "@/lib/format";
import { queries } from "@/lib/queries";
import { RealizedPnlInsight } from "../_lib/RealizedPnlInsight";

/** The portfolio endpoint answers 422 ACCOUNT_NOT_ACTIVE until onboarding finishes. */
function isNoAccount(error: unknown): boolean {
  return error instanceof ApiError && error.body.subcode === "ACCOUNT_NOT_ACTIVE";
}

export default function PortfolioPage() {
  const mode = useTradingMode();
  const portfolio = useQuery({ ...queries.portfolio(), enabled: mode === "paper" });
  const { data } = portfolio;

  // Live preview shows live's own empty state — paper holdings never
  // re-badge as live (ADR-011).
  if (mode === "live") {
    return (
      <LiveEmptyState
        heading="Portfolio"
        body="No live positions. Your live portfolio starts after your first deposit."
      />
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
      <div className="ar-appbar">
        <div className="ar-appbar__title">
          <h1 className="ar-title">Portfolio</h1>
          {data ? (
            <p className="ar-caption ar-tertiary" style={{ margin: 0 }}>
              Valuations as of {formatTime(data.summary.asOf)} ·{" "}
              {formatMarketStatus(data.market.status)}
            </p>
          ) : null}
        </div>
      </div>

      {data ? (
        <PortfolioContent data={data} />
      ) : showError(portfolio) && isNoAccount(portfolio.error) ? (
        <EmptyCard
          title="No practice account yet"
          message="Open your practice account on the dashboard. Your holdings appear here once it's funded."
          action={
            <Link href="/" className="ar-btn ar-btn--primary">
              Go to dashboard
            </Link>
          }
        />
      ) : showError(portfolio) ? (
        <ErrorCard
          message="Portfolio could not be loaded."
          onRetry={() => void portfolio.refetch()}
          retrying={portfolio.isFetching}
        />
      ) : (
        <div
          aria-busy="true"
          role="status"
          aria-label="Loading portfolio"
          style={{ display: "grid", gap: 16 }}
        >
          <div className="ar-skel" style={{ height: 140, borderRadius: "var(--radius-hero)" }} />
          <div className="ar-skel" style={{ height: 200, borderRadius: "var(--radius-card)" }} />
        </div>
      )}
    </div>
  );
}

type PortfolioData = Awaited<ReturnType<typeof api.portfolio>>;

function PortfolioContent({ data }: { data: PortfolioData }) {
  return (
    <>
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
            <span className="ar-chipicon ar-chipicon--xs ar-chipicon--cash">
              <Icon name="cash" />
            </span>
            Cash
          </span>
          <span className="ar-insight__value">
            <Money value={data.summary.cash} />
          </span>
        </div>
        <div className="ar-insight">
          <span className="ar-insight__head">
            <span className="ar-chipicon ar-chipicon--xs ar-chipicon--stocks">
              <Icon name="positions" />
            </span>
            Positions value
          </span>
          <span className="ar-insight__value">
            <Money value={data.summary.positionsValue} />
          </span>
        </div>
        <RealizedPnlInsight amount={data.summary.realizedPnl} />
      </div>

      <div className="ar-section">
        <h2 className="ar-heading">Holdings</h2>
      </div>
      {data.positions.length === 0 ? (
        <EmptyCard
          title="No positions"
          message="Find an instrument to place your first paper trade."
          action={
            <Link href="/markets" className="ar-btn ar-btn--primary">
              Search markets
            </Link>
          }
        />
      ) : (
        <div className="ar-card ar-card--list">
          {/* ≤767px the rows collapse to two lines — symbol + qty / value +
              P&L (RESPONSIVE_BEHAVIOR.md); avg cost and last are wide-only. */}
          <table className="data-table collapsible">
            <caption className="sr-only">Positions</caption>
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col" className="num">
                  Qty
                </th>
                <th scope="col" className="num" data-cell="wide">
                  Avg cost
                </th>
                <th scope="col" className="num" data-cell="wide">
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
                    {formatShares(p.qty)}
                  </td>
                  <td className="num tabular" data-cell="wide" title={formatPrice4(p.avgCost)}>
                    {formatPrice(p.avgCost)}
                  </td>
                  <td className="num tabular" data-cell="wide">
                    {p.lastPrice ? formatPrice(p.lastPrice) : "N/A"}
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
        </div>
      )}
    </>
  );
}
