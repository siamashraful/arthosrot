"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { NetWorthChart } from "@/components/finance/NetWorthChart";
import { SymbolLogo } from "@/components/finance/SymbolLogo";
import { OnboardingPanel } from "@/components/onboarding";
import { OrdersTable } from "@/components/finance/OrdersTable";
import { Money } from "@/components/finance/Money";
import { PriceChange } from "@/components/finance/PriceChange";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/format";

export default function DashboardPage() {
  // Account gate: no account yet (or still provisioning) renders onboarding.
  // While PROVISIONING the me-poll doubles as the activation check — the
  // server tries to activate on every read once venue funding settles.
  const { data: me, isPending: mePending } = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    refetchInterval: (query) =>
      query.state.data?.account?.status === "PROVISIONING" ? 4_000 : false,
  });
  const accountActive = me?.account?.status === "ACTIVE";

  const { data: portfolio, isPending } = useQuery({
    queryKey: ["portfolio"],
    queryFn: api.portfolio,
    refetchInterval: 30_000,
    enabled: accountActive,
  });
  const { data: watchlist } = useQuery({
    queryKey: ["watchlist"],
    queryFn: api.watchlist,
    refetchInterval: 15_000,
    enabled: accountActive,
  });

  if (!mePending && me && !accountActive) {
    const status =
      me.account === null
        ? ("NONE" as const)
        : (me.account.status as "PROVISIONING" | "PROVISIONING_FAILED");
    return (
      <div style={{ display: "grid", gap: "var(--space-5)" }}>
        <header>
          <h1 style={{ fontSize: "var(--text-xl)" }}>Dashboard</h1>
        </header>
        <OnboardingPanel status={status} bounds={me.onboarding} />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <header>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Dashboard</h1>
      </header>

      {isPending || !portfolio ? (
        <div className="skeleton" style={{ height: 72 }} />
      ) : (
        <section aria-label="Account summary" className="field-panel tabular">
          <div className="field-label">Portfolio value</div>
          <div style={{ fontSize: "var(--text-hero)", fontWeight: 600 }}>
            <Money value={portfolio.summary.equity} />
          </div>
          <div
            className="muted"
            style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-3)" }}
          >
            as of {formatTime(portfolio.summary.asOf)} · market {portfolio.market.status}
          </div>

          <NetWorthChart />

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-3) var(--space-7)",
              marginTop: "var(--space-4)",
              paddingTop: "var(--space-4)",
              borderTop: "1px solid var(--field-thread)",
            }}
          >
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
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                      }}
                    >
                      <SymbolLogo symbol={p.symbol} />
                      <Link href={`/i/${p.symbol}`}>{p.symbol}</Link>
                    </span>
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
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                      }}
                    >
                      <SymbolLogo symbol={item.symbol} />
                      <Link href={`/i/${item.symbol}`}>{item.symbol}</Link>
                    </span>{" "}
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
