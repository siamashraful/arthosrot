"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatCompactMoney, formatPrice } from "@/lib/format";

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/**
 * Key stats in the same label/value rows as "Your position" (.ar-ticket-row
 * in a card) — the system's stat-row pattern, not a new one. Each figure says
 * where it comes from in the footnote: these are derived display numbers,
 * and never presented as more precise or more live than they are.
 */
export function KeyStats({ symbol }: { symbol: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["instrument-stats", symbol],
    queryFn: () => api.instrumentStats(symbol),
    staleTime: 60_000,
  });

  const value = (v: string | null | undefined) =>
    isPending ? <span className="ar-skel ar-skel--text" style={{ width: 64 }} /> : (v ?? "—");

  const pe = data?.pe ?? (data?.peNotMeaningful ? "n/m" : null);
  const notes = [
    data?.sharesAsOf ? `Market cap: SEC shares (${shortDate(data.sharesAsOf)}) × last price` : null,
    data?.pe && data.epsPeriodEnd
      ? `P/E: ${data.peBasis === "ttm" ? "trailing 12-month" : "fiscal-year"} EPS to ${shortDate(data.epsPeriodEnd)}`
      : data?.peNotMeaningful
        ? "P/E n/m: trailing earnings are negative"
        : null,
  ].filter(Boolean);

  return (
    <section aria-labelledby="key-stats-heading" style={{ display: "grid", gap: 8 }}>
      <h2 id="key-stats-heading" className="ar-heading" style={{ margin: 0 }}>
        Key stats
      </h2>
      <div className="ar-card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        <div className="ar-ticket-row">
          <span className="ar-ticket-row__label">Market cap</span>
          <span className="ar-ticket-row__value">
            {value(data?.marketCap ? formatCompactMoney(data.marketCap) : null)}
          </span>
        </div>
        <div className="ar-ticket-row">
          <span className="ar-ticket-row__label">
            P/E ratio{data?.peBasis === "fy" ? " (FY)" : data?.pe ? " (TTM)" : ""}
          </span>
          <span className="ar-ticket-row__value">
            {value(pe)}
            {pe === "n/m" ? (
              <span className="sr-only"> — not meaningful, negative earnings</span>
            ) : null}
          </span>
        </div>
        <div className="ar-ticket-row">
          <span className="ar-ticket-row__label">52-week high</span>
          <span className="ar-ticket-row__value">
            {value(data?.week52 ? formatPrice(data.week52.high) : null)}
          </span>
        </div>
        <div className="ar-ticket-row">
          <span className="ar-ticket-row__label">52-week low</span>
          <span className="ar-ticket-row__value">
            {value(data?.week52 ? formatPrice(data.week52.low) : null)}
          </span>
        </div>
      </div>
      {isError ? (
        <p className="ar-caption ar-tertiary" style={{ margin: 0 }}>
          Key stats are unavailable right now.
        </p>
      ) : notes.length > 0 ? (
        <p className="ar-caption ar-tertiary" style={{ margin: 0 }}>
          {notes.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
