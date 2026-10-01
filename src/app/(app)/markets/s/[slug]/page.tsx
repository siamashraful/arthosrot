"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { BackAppBar } from "@/components/BackAppBar";
import { BrowseChip } from "@/components/finance/BrowseGrid";
import { FreshnessChip } from "@/components/finance/FreshnessChip";
import { PriceChange } from "@/components/finance/PriceChange";
import { SymbolRow } from "@/components/finance/SymbolRow";
import { EmptyCard, ErrorCard, SkeletonRows, showError } from "@/components/states";
import { ApiError, api } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";

/**
 * The list screen's frame: the back app bar (compact centred title) over the
 * content. `title` null = still loading — a skeleton bar, no empty heading.
 */
function ListShell({ title, children }: { title: string | null; children: ReactNode }) {
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, maxWidth: "48rem" }}
    >
      <BackAppBar
        href="/markets"
        backLabel="Back to search"
        size="sm"
        titleAs={title === null ? "span" : "h1"}
        title={
          title ?? (
            <span
              className="ar-skel ar-skel--text"
              style={{ display: "inline-block", width: 140 }}
              aria-hidden
            />
          )
        }
      />
      {children}
    </div>
  );
}

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

  if (!first) {
    if (list.error instanceof ApiError && list.error.status === 404) {
      return (
        <ListShell title="List not found">
          <EmptyCard
            message="This list doesn't exist."
            action={
              <Link href="/markets" className="ar-btn ar-btn--secondary ar-btn--compact">
                Back to search
              </Link>
            }
          />
        </ListShell>
      );
    }
    return (
      <ListShell title={null}>
        {showError(list) ? (
          <ErrorCard
            message="Prices for this list are unavailable right now."
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        ) : (
          <SkeletonRows count={4} />
        )}
      </ListShell>
    );
  }

  const rows = list.data?.pages.flatMap((p) => p.instruments) ?? [];
  const closed = first.market.status === "CLOSED";

  return (
    <ListShell title={first.list.name}>
      <section aria-label={`About ${first.list.name}`} className="ar-card browse-intro">
        <BrowseChip icon={first.list.icon} size="md" />
        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <p className="ar-body" style={{ margin: 0 }}>
            {first.list.blurb}
          </p>
          <div className="browse-intro__meta">
            <span className="ar-caption ar-secondary">
              {first.rankingAsOf
                ? `Ranked by market value · updated ${formatDate(first.rankingAsOf)}`
                : `${first.list.count} companies`}
            </span>
            {first.freshnessTs && first.source ? (
              <FreshnessChip
                ts={first.freshnessTs}
                source={first.source}
                marketStatus={first.market.status}
                freshness={first.freshness}
              />
            ) : null}
          </div>
        </div>
      </section>

      {rows.length === 0 ? (
        <EmptyCard message="No companies in this list yet." />
      ) : (
        <ul className="ar-card ar-card--list ar-list">
          {rows.map((r) => (
            <li key={r.symbol}>
              <SymbolRow
                symbol={r.symbol}
                title={r.symbol}
                sub={r.name}
                lead={
                  r.rank !== undefined ? (
                    <span className="browse-rank">
                      <span className="sr-only">Rank </span>
                      {r.rank}
                    </span>
                  ) : undefined
                }
                end={
                  r.quote ? (
                    <>
                      <span className="ar-row__value">{formatPrice(r.quote.last)}</span>
                      {r.quote.dayChange ? (
                        <span>
                          <PriceChange
                            amount={r.quote.dayChange.absolute}
                            percent={r.quote.dayChange.percent}
                          />
                          <span className="sr-only">{closed ? " last session" : " today"}</span>
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="ar-row__value ar-tertiary">
                      N/A<span className="sr-only">: no quote</span>
                    </span>
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}

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
      {list.isFetchNextPageError ? (
        <p role="alert" className="field-error" style={{ margin: 0 }}>
          More companies couldn&apos;t be loaded. Try again.
        </p>
      ) : null}
    </ListShell>
  );
}
