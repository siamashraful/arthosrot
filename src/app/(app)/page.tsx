"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, PieChart, X } from "lucide-react";
import Link from "next/link";
import { NetWorthChart } from "@/components/finance/NetWorthChart";
import { SymbolLogo } from "@/components/finance/SymbolLogo";
import { OnboardingPanel } from "@/components/onboarding";
import { OrdersTable } from "@/components/finance/OrdersTable";
import { Money } from "@/components/finance/Money";
import { PriceChange } from "@/components/finance/PriceChange";
import { FINANCE_GLYPHS, MetricIcon } from "@/components/finance/MetricIcon";
import { LiveDashboard } from "@/components/live-preview";
import { useTradingMode } from "@/components/trading-mode";
import { api } from "@/lib/api";
import { formatPrice, formatTime, signOf } from "@/lib/format";

const { cash: CashGlyph, positions: PositionsGlyph, trade: TradeGlyph } = FINANCE_GLYPHS;

/**
 * Display-only share of the account (0–100) for a tile's bar. A rendering-
 * boundary ratio like FillProgress's percentage: no money arithmetic, the
 * number never feeds back into a financial value.
 */
function sharePercent(part: string, whole: string): number {
  const p = Number(part);
  const w = Number(whole);
  if (!Number.isFinite(p) || !Number.isFinite(w) || w <= 0 || p <= 0) return 0;
  return Math.round(Math.min(100, (p / w) * 100));
}

export default function DashboardPage() {
  // Live preview never shows paper data (ADR-011): gate BEFORE any paper
  // markup — the queries below stay disabled while in live mode.
  const mode = useTradingMode();
  const queryClient = useQueryClient();

  // Account gate: no account yet (or still provisioning) renders onboarding.
  // While PROVISIONING the me-poll doubles as the activation check — the
  // server tries to activate on every read once venue funding settles.
  const { data: me, isPending: mePending } = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    enabled: mode === "paper",
    refetchInterval: (query) =>
      query.state.data?.account?.status === "PROVISIONING" ? 4_000 : false,
  });
  const accountActive = me?.account?.status === "ACTIVE";

  const { data: portfolio, isPending } = useQuery({
    queryKey: ["portfolio"],
    queryFn: api.portfolio,
    refetchInterval: 30_000,
    enabled: mode === "paper" && accountActive,
  });
  const { data: watchlist } = useQuery({
    queryKey: ["watchlist"],
    queryFn: api.watchlist,
    refetchInterval: 15_000,
    enabled: mode === "paper" && accountActive,
  });
  // Today's change for the hero delta chip — the same server-side decimal
  // delta the chart uses, at the 1D range.
  const { data: today } = useQuery({
    queryKey: ["portfolio-history", "1D"],
    queryFn: () => api.portfolioHistory("1D"),
    refetchInterval: 30_000,
    enabled: mode === "paper" && accountActive,
  });

  const removeWatch = useMutation({
    mutationFn: (itemId: string) => api.removeFromWatchlist(itemId),
    onSuccess: (fresh) => queryClient.setQueryData(["watchlist"], fresh),
  });

  if (mode === "live") return <LiveDashboard />;

  if (!mePending && me && !accountActive) {
    const status =
      me.account === null
        ? ("NONE" as const)
        : (me.account.status as "PROVISIONING" | "PROVISIONING_FAILED");
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div className="ar-appbar">
          <h1 className="ar-appbar__title">Dashboard</h1>
        </div>
        <OnboardingPanel status={status} bounds={me.onboarding} />
      </div>
    );
  }

  const todayChange = today && signOf(today.change.absolute) !== 0 ? today.change : null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="ar-appbar">
        <h1 className="ar-appbar__title">Dashboard</h1>
      </div>

      {isPending || !portfolio ? (
        // Placeholder shaped like the content it stands in for (hero card +
        // tiles) so the page does not jump when the numbers arrive.
        <div
          aria-busy="true"
          aria-label="Loading account summary"
          role="status"
          style={{ display: "grid", gap: 16 }}
        >
          <div className="ar-skel" style={{ height: 196, borderRadius: "var(--radius-hero)" }} />
          <div className="ar-tile-grid">
            <div className="ar-skel" style={{ height: 132, borderRadius: "var(--radius-card)" }} />
            <div className="ar-skel" style={{ height: 132, borderRadius: "var(--radius-card)" }} />
          </div>
        </div>
      ) : (
        <>
          <section aria-label="Account summary" className="ar-hero">
            <span className="ar-hero__label">Portfolio value</span>
            <span className="ar-hero__value">
              <Money value={portfolio.summary.equity} />
            </span>
            {todayChange ? (
              <span className="ar-hero__delta">
                <PriceChange
                  chip
                  amount={todayChange.absolute}
                  percent={todayChange.percent !== null ? Number(todayChange.percent) : undefined}
                />
                <span>today</span>
              </span>
            ) : null}
            <span className="ar-hero__delta ar-caption">
              as of {formatTime(portfolio.summary.asOf)} · market {portfolio.market.status}
            </span>
            <div className="ar-hero__actions">
              <Link href="/markets" className="ar-hero__pill">
                <TradeGlyph size={18} aria-hidden />
                Trade
              </Link>
              <Link href="/portfolio" className="ar-hero__pill">
                <PieChart size={18} aria-hidden />
                Portfolio
              </Link>
              <Link href="/activity" className="ar-hero__pill">
                <Activity size={18} aria-hidden />
                Activity
              </Link>
            </div>
          </section>

          <div className="ar-section">
            <h2 className="ar-heading">Accounts</h2>
          </div>
          <div className="ar-tile-grid">
            <Link href="/portfolio" className="ar-tile ar-tile--cobalt">
              <div className="ar-tile__head">
                <span className="ar-tile__name">Stocks</span>
                <PositionsGlyph size={20} aria-hidden />
              </div>
              <div>
                <span className="ar-tile__value">
                  <Money value={portfolio.summary.positionsValue} />
                </span>
                <span className="ar-tile__return">Invested</span>
                <div className="ar-tile__bar" aria-hidden>
                  <span
                    style={{
                      width: `${sharePercent(
                        portfolio.summary.positionsValue,
                        portfolio.summary.equity,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </Link>
            <div className="ar-ptile">
              <div className="ar-ptile__head">
                <span className="ar-chipicon ar-chipicon--cash ar-chipicon--sm" aria-hidden>
                  <CashGlyph />
                </span>
                <span className="ar-ptile__name">Cash</span>
              </div>
              <span className="ar-ptile__value">
                <Money value={portfolio.summary.cash} />
              </span>
              <div className="ar-ptile__foot">
                <span className="ar-tertiary">Available to trade</span>
                <span className="tabular">
                  <Money value={portfolio.summary.buyingPower} />
                </span>
              </div>
              <div className="ar-ptile__bar" aria-hidden>
                <span
                  style={{
                    width: `${sharePercent(portfolio.summary.cash, portfolio.summary.equity)}%`,
                    background: "var(--mustard)",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="ar-card">
            <NetWorthChart />
          </div>

          <div className="ar-insight-row">
            <div className="ar-insight">
              <span className="ar-insight__head">
                <MetricIcon type="buying-power" />
                Buying power
              </span>
              <span className="ar-insight__value">
                <Money value={portfolio.summary.buyingPower} />
              </span>
            </div>
            <div className="ar-insight">
              <span className="ar-insight__head">
                <MetricIcon type="realized" />
                Realized P&L
              </span>
              <span className="ar-insight__value">
                <PriceChange amount={portfolio.summary.realizedPnl} />
              </span>
            </div>
          </div>
        </>
      )}

      {portfolio && portfolio.positions.length === 0 ? (
        <div className="ar-card">
          <div className="ar-empty">
            <span className="ar-empty__title">No positions yet</span>
            <span className="ar-empty__text">Search a symbol to place your first paper trade.</span>
            <Link href="/markets" className="ar-btn ar-btn--primary">
              Search markets
            </Link>
          </div>
        </div>
      ) : null}

      {portfolio && portfolio.positions.length > 0 ? (
        <section aria-label="Top positions">
          <div className="ar-section">
            <h2 className="ar-heading">Positions</h2>
            <Link href="/portfolio" className="ar-link">
              Full portfolio
            </Link>
          </div>
          <ul className="ar-card ar-card--list ar-list" style={{ listStyle: "none", margin: 0 }}>
            {portfolio.positions.slice(0, 5).map((p) => (
              <li key={p.symbol}>
                <Link href={`/i/${p.symbol}`} className="ar-row">
                  <SymbolLogo symbol={p.symbol} size={40} />
                  <span className="ar-row__main">
                    <span className="ar-row__title">{p.symbol}</span>
                    <span className="ar-row__sub">
                      {p.qty} {p.qty === "1" ? "share" : "shares"}
                      {p.lastPrice ? ` · ${formatPrice(p.lastPrice)}` : ""}
                    </span>
                  </span>
                  <span className="ar-row__end">
                    <span className="ar-row__value">
                      <Money value={p.marketValue} />
                    </span>
                    <PriceChange amount={p.unrealizedPnl} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Watchlist">
        <div className="ar-section">
          <h2 className="ar-heading">Watchlist</h2>
        </div>
        {!watchlist || watchlist.items.length === 0 ? (
          <div className="ar-card">
            <div className="ar-empty">
              <span className="ar-empty__text">
                Add symbols from an <Link href="/markets">instrument page</Link> to track them here.
              </span>
            </div>
          </div>
        ) : (
          <ul className="ar-card ar-card--list ar-list" style={{ listStyle: "none", margin: 0 }}>
            {watchlist.items.map((item) => (
              <li key={item.id}>
                <Link href={`/i/${item.symbol}`} className="ar-row">
                  <SymbolLogo symbol={item.symbol} size={40} />
                  <span className="ar-row__main">
                    <span className="ar-row__title">
                      {item.name === item.symbol ? item.symbol : item.name}
                      {item.name === item.symbol ? null : (
                        <span className="ar-ticker">{item.symbol}</span>
                      )}
                    </span>
                    <span className="ar-row__sub">Last price</span>
                  </span>
                  <span className="ar-row__end">
                    <span className="ar-row__value">
                      {item.quote ? formatPrice(item.quote.last) : "—"}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  className="ar-btn ar-btn--icon ar-btn--plain"
                  aria-label={`Remove ${item.symbol} from watchlist`}
                  disabled={removeWatch.isPending}
                  onClick={() => removeWatch.mutate(item.id)}
                >
                  <X size={18} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {removeWatch.isError ? (
          <p role="alert" className="field-error" style={{ margin: "8px 0 0" }}>
            That symbol could not be removed — try again.
          </p>
        ) : null}
      </section>

      <section aria-label="Open orders">
        <div className="ar-section">
          <h2 className="ar-heading">Open orders</h2>
        </div>
        <OrdersTable status="open" limit={5} />
      </section>
    </div>
  );
}
