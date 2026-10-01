"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Icon, type IconName } from "@/components/icons/Icon";
import { LiveEmptyState } from "@/components/live-preview";
import { EmptyCard, ErrorCard, SkeletonRows, showError } from "@/components/states";
import { useTradingMode } from "@/components/trading-mode";
import { api } from "@/lib/api";
import { formatDayLabel, formatSignedMoney, formatTime, marketDay, signOf } from "@/lib/format";

type LedgerEntry = Awaited<ReturnType<typeof api.ledger>>["entries"][number];

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  TRADE: "Trade",
  FEE: "Fee",
  ADJUSTMENT: "Adjustment",
};

/**
 * The chip for a ledger entry (DESIGN.md → Iconography): money in is the gain
 * chip with arrow-down-left, money out (withdrawal, fee) the loss chip with
 * arrow-up-right, a trade the Stocks category chip. An adjustment follows its
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

/** Newest-first entries → consecutive market-time (ET) day groups. */
function groupByDay(entries: LedgerEntry[]) {
  const groups: Array<{ day: string; label: string; entries: LedgerEntry[] }> = [];
  for (const entry of entries) {
    const day = marketDay(entry.createdAt);
    const last = groups.at(-1);
    if (last?.day === day) last.entries.push(entry);
    else groups.push({ day, label: formatDayLabel(entry.createdAt), entries: [entry] });
  }
  return groups;
}

function EntryRow({ entry }: { entry: LedgerEntry }) {
  const sign = signOf(entry.amount);
  const chip = entryChip(entry.type, sign);
  return (
    <li className="ar-row">
      <span className={`ar-chipicon ar-chipicon--${chip.kind}`} aria-hidden>
        <Icon name={chip.icon} />
      </span>
      <div className="ar-row__main">
        <span className="ar-row__title">{entry.description}</span>
        <span className="ar-row__sub">
          {TYPE_LABEL[entry.type] ?? entry.type} · {formatTime(entry.createdAt)}
        </span>
        {entry.archived ? (
          <span>
            <span className="ar-tag ar-tag--neutral">archived account</span>
          </span>
        ) : null}
      </div>
      <div className="ar-row__end">
        <span className={`ar-row__value${sign > 0 ? " ar-row__value--gain" : ""}`}>
          <span className="sr-only">{sign > 0 ? "in " : sign < 0 ? "out " : ""}</span>
          {sign === 0
            ? formatSignedMoney(entry.amount).replace("+", "")
            : formatSignedMoney(entry.amount)}
        </span>
      </div>
    </li>
  );
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
  const entries = ledger.data?.pages.flatMap((p) => p.entries);

  // The paper ledger must never read as live history (ADR-011).
  if (mode === "live") {
    return (
      <LiveEmptyState
        heading="Activity"
        body="No live activity. Deposits, withdrawals, and trades will appear here once live trading launches."
      />
    );
  }

  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, maxWidth: "44rem" }}
    >
      <div className="ar-appbar">
        <div className="ar-appbar__title">
          <h1 className="ar-title">Activity</h1>
          <p className="ar-caption ar-tertiary" style={{ margin: 0 }}>
            The append-only ledger: every cash movement, with its cause.
          </p>
        </div>
      </div>

      {entries ? (
        entries.length === 0 ? (
          <EmptyCard
            title="No activity yet"
            message="Your opening deposit and every trade will appear here."
          />
        ) : (
          <div>
            {groupByDay(entries).map((group, i) => (
              <section key={group.day} aria-labelledby={`activity-day-${group.day}`}>
                <h2
                  id={`activity-day-${group.day}`}
                  className="ar-group-label"
                  style={i === 0 ? { marginTop: 0 } : undefined}
                >
                  {group.label}
                </h2>
                <ul
                  className="ar-card ar-card--list ar-list"
                  style={{ listStyle: "none", margin: 0 }}
                >
                  {group.entries.map((e) => (
                    <EntryRow key={e.id} entry={e} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : showError(ledger) ? (
        <ErrorCard
          message="Activity could not be loaded."
          onRetry={() => void ledger.refetch()}
          retrying={ledger.isFetching}
        />
      ) : (
        <SkeletonRows />
      )}

      {/* Paging only once there is a list to extend; a failed page keeps the
          entries already shown and says so beside the button. */}
      {entries && ledger.hasNextPage ? (
        <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
          {ledger.isFetchNextPageError ? (
            <p role="alert" className="field-error" style={{ margin: 0 }}>
              Older activity could not be loaded. Try again.
            </p>
          ) : null}
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
    </div>
  );
}
