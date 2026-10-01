"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BrowseChip, formatAsOfDate } from "@/components/finance/BrowseGrid";
import { FreshnessChip } from "@/components/finance/FreshnessChip";
import { PriceChange } from "@/components/finance/PriceChange";
import { SymbolLogo } from "@/components/finance/SymbolLogo";
import { ApiError, api } from "@/lib/api";
import { formatPrice } from "@/lib/format";

/**
 * One browse list — a sector, or the Top 100 by market value. Rows: logo,
 * symbol, name, last price and today's move (sign + arrow + sr-text). Prices
 * carry one freshness chip for the list; the Top 100 states when it was
 * ranked, because the order is not live.
 */
export default function BrowseListPage() {
  const { slug } = useParams<{ slug: string }>();
  const list = useInfiniteQuery({
    queryKey: ["browse-list", slug],
    queryFn: ({ pageParam }) => api.browseList(slug, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    // quotes move while the market is open; the list itself doesn't
    refetchInterval: (q) => (q.state.data?.pages[0]?.market.status === "OPEN" ? 30_000 : false),
  });

  const first = list.data?.pages[0];
  const rows = list.data?.pages.flatMap((p) => p.instruments) ?? [];
  const closed = first?.market.status === "CLOSED";

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: "48rem" }}>
      <div className="ar-appbar">
        <Link
          href="/markets"
          className="ar-btn ar-btn--icon ar-btn--plain"
          aria-label="Back to markets"
        >
          <ChevronLeft aria-hidden />
        </Link>
        <h1 className="ar-appbar__title ar-appbar__title--sm">{first?.list.name ?? " "}</h1>
      </div>

      {list.isError ? (
        <div className="ar-card">
          <div className="ar-empty">
            <span className="ar-empty__text">
              {list.error instanceof ApiError && list.error.status === 404
                ? "This list doesn't exist."
                : "Prices for this list are unavailable right now — try again shortly."}
            </span>
            <Link href="/markets" className="ar-link">
              Back to Markets
            </Link>
          </div>
        </div>
      ) : list.isPending ? (
        <div className="ar-card ar-card--list" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ar-skel-row">
              <span className="ar-skel ar-skel--chip" />
              <div className="ar-skel-row__main">
                <span className="ar-skel ar-skel--text" style={{ width: "30%" }} />
                <span className="ar-skel ar-skel--text" style={{ width: "55%" }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <section aria-label={`About ${first!.list.name}`} className="ar-card browse-intro">
            <BrowseChip icon={first!.list.icon} size="md" />
            <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
              <p className="ar-body" style={{ margin: 0 }}>
                {first!.list.blurb}
              </p>
              <div className="browse-intro__meta">
                {first!.rankingAsOf ? (
                  <span className="ar-caption ar-secondary">
                    Ranked by market value · updated {formatAsOfDate(first!.rankingAsOf)}
                  </span>
                ) : (
                  <span className="ar-caption ar-secondary">{first!.list.count} companies</span>
                )}
                {first!.freshnessTs && first!.source ? (
                  <FreshnessChip
                    ts={first!.freshnessTs}
                    source={first!.source}
                    marketStatus={first!.market.status}
                  />
                ) : null}
              </div>
            </div>
          </section>

          <ul className="ar-card ar-card--list ar-list" style={{ listStyle: "none", margin: 0 }}>
            {rows.map((r) => (
              <li key={r.symbol}>
                <Link href={`/i/${encodeURIComponent(r.symbol)}`} className="ar-row">
                  {r.rank !== undefined ? (
                    <span className="browse-rank">
                      <span className="sr-only">Rank </span>
                      {r.rank}
                    </span>
                  ) : null}
                  <SymbolLogo symbol={r.symbol} size={40} />
                  <span className="ar-row__main">
                    <span className="ar-row__title">{r.symbol}</span>
                    <span className="ar-row__sub">{r.name}</span>
                  </span>
                  <span className="ar-row__end">
                    {r.quote ? (
                      <>
                        <span className="ar-row__value">{formatPrice(r.quote.last)}</span>
                        {r.quote.dayChange ? (
                          <span>
                            <PriceChange
                              amount={r.quote.dayChange.absolute}
                              percent={Number(r.quote.dayChange.percent)}
                            />
                            <span className="sr-only">{closed ? " last session" : " today"}</span>
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="ar-row__value ar-tertiary" aria-label="No quote">
                        —
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {list.hasNextPage ? (
            <div>
              <button
                type="button"
                className="ar-btn ar-btn--secondary"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? "Loading…" : "Show more"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
