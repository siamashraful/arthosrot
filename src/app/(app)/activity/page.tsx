"use client";

import { useQuery } from "@tanstack/react-query";
import { PriceChange } from "@/components/finance/PriceChange";
import { LiveEmptyState } from "@/components/live-preview";
import { useTradingMode } from "@/components/trading-mode";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  TRADE: "Trade",
  FEE: "Fee",
  ADJUSTMENT: "Adjustment",
};

export default function ActivityPage() {
  const mode = useTradingMode();
  const { data, isPending, isError } = useQuery({
    queryKey: ["ledger"],
    queryFn: api.ledger,
    enabled: mode === "paper",
  });

  // The paper ledger must never read as live history (ADR-011).
  if (mode === "live") {
    return (
      <LiveEmptyState
        heading="Activity"
        body="No live activity — deposits, withdrawals, and trades will appear here once live trading launches."
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-5)", maxWidth: "44rem" }}>
      <header>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Activity</h1>
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          The append-only ledger — every cash movement, with its cause.
        </p>
      </header>

      {isPending ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : isError || !data ? (
        <div className="empty-state">Activity could not be loaded. Retry shortly.</div>
      ) : data.entries.length === 0 ? (
        <div className="empty-state">No activity yet.</div>
      ) : (
        <div className="card">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
            {data.entries.map((e) => (
              <li key={e.id} className="list-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>{e.description}</div>
                  <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    {TYPE_LABEL[e.type] ?? e.type} · {formatDateTime(e.createdAt)}
                    {e.archived ? <span className="badge"> archived account</span> : null}
                  </div>
                </div>
                <span className="tabular">
                  <PriceChange amount={e.amount} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
