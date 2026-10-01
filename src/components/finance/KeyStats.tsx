"use client";

import { useQuery } from "@tanstack/react-query";
import { showError } from "@/components/states";
import { api } from "@/lib/api";
import { formatCompactMoney, formatDate, formatPrice } from "@/lib/format";

/**
 * The system's StockDetail "Stats": a compact card holding a two-column grid
 * of label/value cells (market cap | P/E, 52-week high | low). Each figure
 * says where it comes from in the footnote: these are derived display
 * numbers, and never presented as more precise or more live than they are.
 * "—" = unavailable; "n/m" = a P/E that isn't meaningful (negative earnings).
 */
export function KeyStats({ symbol }: { symbol: string }) {
  const stats = useQuery({
    queryKey: ["instrument-stats", symbol],
    queryFn: () => api.instrumentStats(symbol),
    staleTime: 60_000,
  });
  const { data, isPending } = stats;

  const value = (v: string | null | undefined) =>
    isPending ? <span className="ar-skel ar-skel--text" style={{ width: 56 }} /> : (v ?? "N/A");

  const pe = data?.pe ?? (data?.peNotMeaningful ? "n/m" : null);
  const notes = [
    data?.sharesAsOf
      ? `Market cap: SEC shares (${formatDate(data.sharesAsOf)}) × last price`
      : null,
    data?.pe && data.epsPeriodEnd
      ? `P/E: ${data.peBasis === "ttm" ? "trailing 12-month" : "fiscal-year"} EPS to ${formatDate(data.epsPeriodEnd)}`
      : data?.peNotMeaningful
        ? "P/E n/m: trailing earnings are negative"
        : null,
  ].filter(Boolean);

  return (
    <section aria-labelledby="key-stats-heading" style={{ display: "grid", gap: 8 }}>
      <h2 id="key-stats-heading" className="ar-heading" style={{ margin: 0 }}>
        Stats
      </h2>
      <div className="ar-card ar-card--compact" style={{ padding: "4px 16px" }}>
        <div className="ar-stats">
          <div className="ar-stat">
            <span className="ar-stat__label">Market cap</span>
            <span className="ar-stat__value">
              {value(data?.marketCap ? formatCompactMoney(data.marketCap) : null)}
            </span>
          </div>
          <div className="ar-stat">
            <span className="ar-stat__label">
              P/E ratio{data?.peBasis === "fy" ? " (FY)" : data?.pe ? " (TTM)" : ""}
            </span>
            <span className="ar-stat__value">
              {value(pe)}
              {pe === "n/m" ? (
                <span className="sr-only">: not meaningful, negative earnings</span>
              ) : null}
            </span>
          </div>
          <div className="ar-stat">
            <span className="ar-stat__label">52w high</span>
            <span className="ar-stat__value">
              {value(data?.week52 ? formatPrice(data.week52.high) : null)}
            </span>
          </div>
          <div className="ar-stat">
            <span className="ar-stat__label">52w low</span>
            <span className="ar-stat__value">
              {value(data?.week52 ? formatPrice(data.week52.low) : null)}
            </span>
          </div>
        </div>
      </div>
      {showError(stats) ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <p className="ar-caption ar-tertiary" style={{ margin: 0 }}>
            Stats are unavailable right now.
          </p>
          <button
            type="button"
            className="ar-btn ar-btn--secondary ar-btn--compact"
            onClick={() => void stats.refetch()}
            disabled={stats.isFetching}
          >
            {stats.isFetching ? "Retrying…" : "Try again"}
          </button>
        </div>
      ) : notes.length > 0 ? (
        <p className="ar-caption ar-tertiary" style={{ margin: 0 }}>
          {notes.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
