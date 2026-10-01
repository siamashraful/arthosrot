"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BrowseGrid } from "@/components/finance/BrowseGrid";
import { SymbolRow } from "@/components/finance/SymbolRow";
import { Icon } from "@/components/icons/Icon";
import { EmptyCard, ErrorCard, SkeletonRows, showError } from "@/components/states";
import { api } from "@/lib/api";

/** The server's search-query limit (searchSchema) — longer input can never match. */
const MAX_QUERY = 40;

/** One request per pause in typing, not one per keystroke. */
function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function MarketsPage() {
  const [query, setQuery] = useState("");
  const typed = query.trim();
  const debouncedQuery = useDebounced(typed, 300);
  const search = useQuery({
    queryKey: ["instrument-search", debouncedQuery],
    queryFn: () => api.searchInstruments(debouncedQuery),
    enabled: debouncedQuery.length > 0,
    placeholderData: keepPreviousData,
  });
  // Results on screen answer what is typed only once the debounce has caught
  // up AND the fetch for it has landed — until then they are the previous
  // query's, so "No matches" must wait.
  const settled = debouncedQuery === typed && !search.isFetching && !search.isPlaceholderData;
  const results = search.data?.instruments ?? [];

  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, maxWidth: "56rem" }}
    >
      <div className="ar-appbar">
        <h1 className="ar-appbar__title">Search</h1>
      </div>

      <div className="ar-field">
        <label className="ar-field__label" htmlFor="market-search">
          Search US equities
        </label>
        <div className="ar-input ar-input--search">
          <Icon name="search" size={20} />
          <input
            id="market-search"
            placeholder="Symbol or company name, e.g. AAPL"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={MAX_QUERY}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-describedby={typed ? "market-search-status" : undefined}
          />
        </div>
      </div>

      {typed.length === 0 ? (
        <BrowseGrid />
      ) : (
        <section
          aria-label="Search results"
          style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 }}
        >
          <p
            id="market-search-status"
            className="ar-caption ar-secondary"
            role="status"
            style={{ margin: 0 }}
          >
            {!settled
              ? "Searching…"
              : showError(search)
                ? ""
                : results.length === 0
                  ? ""
                  : `${results.length} ${results.length === 1 ? "result" : "results"}`}
          </p>
          {settled && showError(search) ? (
            <ErrorCard
              message="Search isn't available right now."
              onRetry={() => void search.refetch()}
              retrying={search.isFetching}
            />
          ) : !settled && results.length === 0 ? (
            <SkeletonRows count={2} />
          ) : results.length === 0 ? (
            <EmptyCard
              title={`No matches for “${typed}”`}
              message="Try a ticker such as AAPL, or part of a company name."
            />
          ) : (
            <ul className="ar-card ar-card--list ar-list" aria-busy={!settled}>
              {results.map((i) => (
                <li key={i.symbol}>
                  <SymbolRow
                    symbol={i.symbol}
                    title={i.symbol}
                    sub={i.name}
                    end={<span className="ar-tag ar-tag--sky">{i.exchange}</span>}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
