"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { NetWorthChart } from "@/components/finance/NetWorthChart";
import { SymbolRow } from "@/components/finance/SymbolRow";
import { WatchlistFreshnessChip, WatchlistRows } from "@/components/finance/WatchlistRows";
import { EmptyCard, ErrorCard, SkeletonRows, showError } from "@/components/states";
import { OnboardingPanel } from "@/components/onboarding";
import { OrdersTable } from "@/components/finance/OrdersTable";
import { Money } from "@/components/finance/Money";
import { PriceChange } from "@/components/finance/PriceChange";
import { Icon } from "@/components/icons/Icon";
import { RealizedPnlInsight } from "./_lib/RealizedPnlInsight";
import { LiveDashboard } from "@/components/live-preview";
import { useTradingMode } from "@/components/trading-mode";
import { api } from "@/lib/api";
import { formatMarketStatus, formatPrice, formatShares, formatTime, signOf } from "@/lib/format";
import { queries } from "@/lib/queries";

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

type OnboardingStatus = "NONE" | "PROVISIONING" | "PROVISIONING_FAILED";

/** The onboarding panel's state for an account that isn't ACTIVE (none or archived → NONE). */
function onboardingStatus(account: { status: string } | null): OnboardingStatus {
  if (account?.status === "PROVISIONING") return "PROVISIONING";
  if (account?.status === "PROVISIONING_FAILED") return "PROVISIONING_FAILED";
  return "NONE";
}

/**
 * The page's vertical stack. minmax(0, 1fr): a long unbreakable row title
 * (e.g. "Berkshire Hathaway Inc. Class B") must ellipsize inside its row,
 * not widen the page past a phone's viewport.
 */
const PAGE_STACK = { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 } as const;

function DashboardHeader() {
  return (
    <div className="ar-appbar">
      <h1 className="ar-appbar__title">Dashboard</h1>
    </div>
  );
}

export default function DashboardPage() {
  // Live preview never shows paper data (ADR-011): gate BEFORE any paper
  // markup — the queries below stay disabled while in live mode.
  const mode = useTradingMode();
  const queryClient = useQueryClient();

  // Account gate: no account yet (or still provisioning) renders onboarding.
  // While PROVISIONING the me-poll doubles as the activation check — the
  // server tries to activate on every read once venue funding settles.
  const meQuery = useQuery({
    ...queries.me(),
    enabled: mode === "paper",
    refetchInterval: (query) =>
      query.state.data?.account?.status === "PROVISIONING" ? 4_000 : false,
  });
  const me = meQuery.data;
  const accountActive = me?.account?.status === "ACTIVE";

  const portfolioQuery = useQuery({
    ...queries.portfolio(),
    enabled: mode === "paper" && accountActive,
  });
  const portfolio = portfolioQuery.data;
  const watchlistQuery = useQuery({
    ...queries.watchlist(),
    enabled: mode === "paper" && accountActive,
  });
  const watchlist = watchlistQuery.data;
  // Today's change for the hero delta chip — the same server-side decimal
  // delta the chart uses, at the 1D range.
  const { data: today } = useQuery({
    queryKey: ["portfolio-history", "1D"],
    queryFn: () => api.portfolioHistory("1D"),
    refetchInterval: 30_000,
    enabled: mode === "paper" && accountActive,
  });

  // Variables carry the symbol so a failure can name it, and so only the
  // row being removed shows as busy.
  const removeWatch = useMutation({
    mutationFn: (item: { id: string; symbol: string }) => api.removeFromWatchlist(item.id),
    onSuccess: (fresh) => queryClient.setQueryData(queries.watchlist().queryKey, fresh),
  });

  if (mode === "live") return <LiveDashboard />;

  if (showError(meQuery)) {
    return (
      <div style={PAGE_STACK}>
        <DashboardHeader />
        <ErrorCard
          message="Your account couldn't be loaded."
          onRetry={() => void meQuery.refetch()}
          retrying={meQuery.isFetching}
        />
      </div>
    );
  }

  if (me && !accountActive) {
    return (
      <div style={PAGE_STACK}>
        <DashboardHeader />
        <OnboardingPanel status={onboardingStatus(me.account)} bounds={me.onboarding} />
      </div>
    );
  }

  const todayChange = today && signOf(today.change.absolute) !== 0 ? today.change : null;

  return (
    <div style={PAGE_STACK}>
      <DashboardHeader />

      {showError(portfolioQuery) ? (
        <ErrorCard
          message="Your account summary couldn't be loaded."
          onRetry={() => void portfolioQuery.refetch()}
          retrying={portfolioQuery.isFetching}
        />
      ) : !portfolio ? (
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
                <PriceChange chip amount={todayChange.absolute} percent={todayChange.percent} />
                <span>today</span>
              </span>
            ) : null}
            <span className="ar-hero__delta ar-caption">
              as of {formatTime(portfolio.summary.asOf)} ·{" "}
              {formatMarketStatus(portfolio.market.status)}
            </span>
            <div className="ar-hero__actions">
              <Link href="/markets" className="ar-hero__pill">
                <Icon name="trade" size={18} />
                Trade
              </Link>
              <Link href="/portfolio" className="ar-hero__pill">
                <Icon name="pie" size={18} />
                Portfolio
              </Link>
              <Link href="/activity" className="ar-hero__pill">
                <Icon name="activity" size={18} />
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
                <Icon name="stocks" size={20} />
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
                  <Icon name="cash" />
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
                <span className="ar-chipicon ar-chipicon--xs ar-chipicon--cash" aria-hidden>
                  <Icon name="banknote" />
                </span>
                Buying power
              </span>
              <span className="ar-insight__value">
                <Money value={portfolio.summary.buyingPower} />
              </span>
            </div>
            <RealizedPnlInsight amount={portfolio.summary.realizedPnl} />
          </div>

          {portfolio.positions.length === 0 ? (
            <EmptyCard
              title="No positions yet"
              message="Search a symbol to place your first paper trade."
              action={
                <Link href="/markets" className="ar-btn ar-btn--primary">
                  Search markets
                </Link>
              }
            />
          ) : (
            <section aria-label="Top positions">
              <div className="ar-section">
                <h2 className="ar-heading">Positions</h2>
                <Link href="/portfolio" className="ar-link">
                  Full portfolio
                </Link>
              </div>
              <ul className="ar-card ar-card--list ar-list">
                {portfolio.positions.slice(0, 5).map((p) => (
                  <li key={p.symbol}>
                    <SymbolRow
                      symbol={p.symbol}
                      title={p.symbol}
                      sub={`${formatShares(p.qty)}${p.lastPrice ? ` · ${formatPrice(p.lastPrice)}` : ""}`}
                      end={
                        <>
                          <span className="ar-row__value">
                            <Money value={p.marketValue} />
                          </span>
                          <PriceChange amount={p.unrealizedPnl} />
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section aria-labelledby="watchlist-heading">
        <div className="ar-section">
          <h2 id="watchlist-heading" className="ar-heading">
            Watchlist
          </h2>
          {watchlist && watchlist.items.length > 0 ? (
            <WatchlistFreshnessChip items={watchlist.items} />
          ) : null}
        </div>
        {showError(watchlistQuery) ? (
          <ErrorCard
            message="Your watchlist couldn't be loaded."
            onRetry={() => void watchlistQuery.refetch()}
            retrying={watchlistQuery.isFetching}
          />
        ) : !watchlist ? (
          <SkeletonRows count={2} />
        ) : watchlist.items.length === 0 ? (
          <EmptyCard
            message={
              <>
                Add symbols from any stock&apos;s page in <Link href="/markets">Search</Link> to
                track them here.
              </>
            }
          />
        ) : (
          <WatchlistRows
            items={watchlist.items}
            pendingId={removeWatch.isPending ? removeWatch.variables.id : null}
            onRemove={(id, symbol) => removeWatch.mutate({ id, symbol })}
          />
        )}
        {removeWatch.isError ? (
          <p role="alert" className="field-error" style={{ margin: "8px 0 0" }}>
            {removeWatch.variables.symbol} couldn&apos;t be removed. Try again.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="open-orders-heading">
        <div className="ar-section">
          <h2 id="open-orders-heading" className="ar-heading">
            Open orders
          </h2>
        </div>
        <OrdersTable status="open" limit={5} />
      </section>
    </div>
  );
}
