"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Icon, type IconName } from "@/components/icons/Icon";
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
 * The chip for a ledger entry, per the system's Activity screen: money in is
 * the gain chip with arrow-down-left, money out (withdrawal, fee) the loss
 * chip with arrow-up-right, a trade the Stocks chip. An adjustment follows its
 * sign; a zero adjustment is neutral.
 */
function entryChip(type: string, sign: -1 | 0 | 1): { kind: string; icon: IconName } {
  switch (type) {
    case "DEPOSIT":
      return { kind: "gain", icon: "arrow-down-left" };
    case "WITHDRAWAL":
    case "FEE":
      return { kind: "loss", icon: "arrow-up-right" };
    case "TRADE":
      return { kind: "stocks", icon: "stocks" };
    default:
      if (sign > 0) return { kind: "gain", icon: "arrow-down-left" };
      if (sign < 0) return { kind: "loss", icon: "arrow-up-right" };
      return { kind: "neutral", icon: "trade" };
  }
}

export default function ActivityPage() {
  const mode = useTradingMode();
  // The ledger pages newest-first, 50 entries at a time, on a server keyset
  // cursor — history of any length stays reachable.
  const ledger = useInfiniteQuery({
    queryKey: ["ledger"],
    queryFn: ({ pageParam }) => api.ledger(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: mode === "paper",
  });
  const { isPending, isError } = ledger;
  const data = ledger.data ? { entries: ledger.data.pages.flatMap((p) => p.entries) } : undefined;

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
            const chip = entryChip(e.type, sign);
            return (
              <li key={e.id} className="ar-row">
                <span className={`ar-chipicon ar-chipicon--${chip.kind}`} aria-hidden>
                  <Icon name={chip.icon} />
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
      {ledger.hasNextPage ? (
        <div>
          <button
            type="button"
            className="ar-btn ar-btn--secondary"
            disabled={ledger.isFetchingNextPage}
            onClick={() => void ledger.fetchNextPage()}
          >
            {ledger.isFetchingNextPage ? "Loading…" : "Show older activity"}
          </button>
        </div>
      ) : null}
      {ledger.isFetchNextPageError ? (
        <p role="alert" className="field-error" style={{ margin: 0 }}>
          Older activity could not be loaded — try again.
        </p>
      ) : null}
    </div>
  );
}
