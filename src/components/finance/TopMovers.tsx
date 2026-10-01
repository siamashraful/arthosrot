"use client";

import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { EmptyCard, ErrorCard, SkeletonRows, showError } from "@/components/states";
import { api, type DayChangePeriodDto } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { FreshnessChip } from "./FreshnessChip";
import { PriceChange } from "./PriceChange";
import { SymbolRow } from "./SymbolRow";

type Side = "gainers" | "losers";

const SIDES: ReadonlyArray<{ id: Side; label: string }> = [
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
];

function periodWords(period: DayChangePeriodDto): string {
  return period === "today" ? "today" : "last session";
}

function emptyMessage(side: Side, period: DayChangePeriodDto): string {
  const who = side === "gainers" ? "gainers" : "losers";
  return period === "today" ? `No ${who} yet today.` : `No ${who} last session.`;
}

/**
 * Top movers on the Search page: the five biggest gainers or losers by day
 * change across the Top 100 and the sector lists (/api/v1/browse/movers).
 * A SegmentedControl (Gainers | Losers, aria-pressed) over one list card of
 * ListRows — logo, symbol, name, price and the signed delta with an sr-only
 * "today" / "last session". One freshness chip covers the list (the stalest
 * quote shown). Refreshes every minute while the market is open.
 *
 * `headingLevel` 3 + group-label styling when mounted inside another
 * section (e.g. within Browse); 2 + heading styling on its own.
 */
export function TopMovers({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const headingId = useId();
  const [side, setSide] = useState<Side>("gainers");
  const movers = useQuery({
    queryKey: ["movers"],
    queryFn: api.movers,
    refetchInterval: (query) => (query.state.data?.market.status === "OPEN" ? 60_000 : false),
  });
  const { data } = movers;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const rows = data ? data[side] : [];

  return (
    <section
      aria-labelledby={headingId}
      style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}
    >
      <div className="list-head">
        <Heading
          id={headingId}
          className={headingLevel === 2 ? "ar-heading" : "ar-group-label"}
          style={{ margin: 0 }}
        >
          Top movers
        </Heading>
        {data?.freshnessTs && data.source ? (
          <FreshnessChip
            ts={data.freshnessTs}
            source={data.source}
            marketStatus={data.market.status}
            freshness={data.freshness}
          />
        ) : null}
      </div>

      <div className="list-head">
        <div className="ar-seg" role="group" aria-label="Show top movers">
          {SIDES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`ar-seg__item${side === s.id ? " is-selected" : ""}`}
              aria-pressed={side === s.id}
              onClick={() => setSide(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {data ? (
          <span className="ar-caption ar-secondary">
            Top 100 and sectors · % change {periodWords(data.period)}
          </span>
        ) : null}
      </div>

      {showError(movers) ? (
        <ErrorCard
          message="Top movers are unavailable right now."
          onRetry={() => void movers.refetch()}
          retrying={movers.isFetching}
        />
      ) : !data ? (
        <SkeletonRows count={5} />
      ) : rows.length === 0 ? (
        <EmptyCard message={emptyMessage(side, data.period)} />
      ) : (
        <ul
          className="ar-card ar-card--list ar-list"
          aria-label={side === "gainers" ? "Top gainers" : "Top losers"}
        >
          {rows.map((r) => (
            <li key={r.symbol}>
              <SymbolRow
                symbol={r.symbol}
                title={r.symbol}
                sub={r.name}
                end={
                  <>
                    <span className="ar-row__value">{formatPrice(r.quote.last)}</span>
                    {r.dayChange ? (
                      <span>
                        <PriceChange amount={r.dayChange.absolute} percent={r.dayChange.percent} />
                        <span className="sr-only"> {periodWords(data.period)}</span>
                      </span>
                    ) : null}
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
