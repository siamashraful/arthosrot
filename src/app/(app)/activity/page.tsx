"use client";

import { useQuery } from "@tanstack/react-query";
import { PriceChange } from "@/components/finance/PriceChange";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "Deposit",
  TRADE: "Trade",
  FEE: "Fee",
  ADJUSTMENT: "Adjustment",
};

export default function ActivityPage() {
  const { data, isPending, isError } = useQuery({ queryKey: ["ledger"], queryFn: api.ledger });

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
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {data.entries.map((e) => (
            <li
              key={e.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "var(--space-4)",
                padding: "var(--space-3) 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div>
                <div>{e.description}</div>
                <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  {TYPE_LABEL[e.type] ?? e.type} · {formatDateTime(e.createdAt)}
                </div>
              </div>
              <PriceChange amount={e.amount} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
