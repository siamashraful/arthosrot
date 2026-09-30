"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Receipt, SlidersHorizontal, TrendingUp } from "lucide-react";
import { LiveEmptyState } from "@/components/live-preview";
import { useTradingMode } from "@/components/trading-mode";
import { api } from "@/lib/api";
import { formatDateTime, formatSignedMoney, signOf } from "@/lib/format";

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  TRADE: "Trade",
  FEE: "Fee",
  ADJUSTMENT: "Adjustment",
};

/**
 * The semantic chip for a ledger entry: money in is the gain chip, fees and
 * withdrawals the loss chip, trades the Stocks category, adjustments neutral.
 * The chip marks the kind of movement; the signed amount beside it carries
 * the direction in text.
 */
function entryChip(type: string, sign: -1 | 0 | 1): { cls: string; Icon: typeof Receipt } {
  switch (type) {
    case "DEPOSIT":
      return { cls: "ar-chipicon--gain", Icon: ArrowDownLeft };
    case "WITHDRAWAL":
      return { cls: "ar-chipicon--loss", Icon: ArrowUpRight };
    case "FEE":
      return { cls: "ar-chipicon--loss", Icon: Receipt };
    case "TRADE":
      return { cls: "ar-chipicon--stocks", Icon: TrendingUp };
    default:
      return {
        cls: sign > 0 ? "ar-chipicon--gain" : "ar-chipicon--neutral",
        Icon: SlidersHorizontal,
      };
  }
}

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
    <div style={{ display: "grid", gap: 16, maxWidth: "44rem" }}>
      <div className="ar-appbar">
        <div className="ar-appbar__title">
          <h1 className="ar-title">Activity</h1>
          <p className="ar-caption ar-tertiary" style={{ margin: 0 }}>
            The append-only ledger — every cash movement, with its cause.
          </p>
        </div>
      </div>

      {isPending ? (
        <div className="ar-card ar-card--list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="ar-skel-row">
              <span className="ar-skel ar-skel--chip" />
              <div className="ar-skel-row__main">
                <span className="ar-skel ar-skel--text" style={{ width: "50%" }} />
                <span className="ar-skel ar-skel--text" style={{ width: "30%" }} />
              </div>
              <div className="ar-skel-row__end">
                <span className="ar-skel ar-skel--text" style={{ width: 72 }} />
              </div>
            </div>
          ))}
        </div>
      ) : isError || !data ? (
        <div className="ar-card">
          <div className="ar-empty">
            <span className="ar-empty__text">Activity could not be loaded. Retry shortly.</span>
          </div>
        </div>
      ) : data.entries.length === 0 ? (
        <div className="ar-card">
          <div className="ar-empty">
            <span className="ar-empty__title">No activity yet</span>
            <span className="ar-empty__text">Your first deposit and trades will appear here.</span>
          </div>
        </div>
      ) : (
        <ul className="ar-card ar-card--list ar-list" style={{ listStyle: "none", margin: 0 }}>
          {data.entries.map((e) => {
            const sign = signOf(e.amount);
            const { cls, Icon } = entryChip(e.type, sign);
            return (
              <li key={e.id} className="ar-row">
                <span className={`ar-chipicon ${cls}`} aria-hidden>
                  <Icon size={22} />
                </span>
                <div className="ar-row__main">
                  <span className="ar-row__title">{e.description}</span>
                  <span className="ar-row__sub">
                    {TYPE_LABEL[e.type] ?? e.type} · {formatDateTime(e.createdAt)}
                  </span>
                  {e.archived ? (
                    <span>
                      <span className="ar-tag ar-tag--neutral">archived account</span>
                    </span>
                  ) : null}
                </div>
                <div className="ar-row__end">
                  <span className={`ar-row__value${sign > 0 ? " ar-row__value--gain" : ""}`}>
                    <span className="sr-only">{sign > 0 ? "in " : sign < 0 ? "out " : ""}</span>
                    {sign === 0
                      ? formatSignedMoney(e.amount).replace("+", "")
                      : formatSignedMoney(e.amount)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
