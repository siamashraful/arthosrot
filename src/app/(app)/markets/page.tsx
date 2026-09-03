"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SymbolLogo } from "@/components/finance/SymbolLogo";
import { api } from "@/lib/api";

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
  const debouncedQuery = useDebounced(query.trim(), 300);
  const { data, isFetching } = useQuery({
    queryKey: ["instrument-search", debouncedQuery],
    queryFn: () => api.searchInstruments(debouncedQuery),
    enabled: debouncedQuery.length > 0,
    placeholderData: keepPreviousData,
  });

  return (
    <div style={{ display: "grid", gap: "var(--space-5)", maxWidth: "40rem" }}>
      <header>
        <h1 style={{ fontSize: "var(--text-xl)" }}>Markets</h1>
      </header>

      <div className="field">
        <label className="field-label" htmlFor="market-search">
          Search US equities
        </label>
        <input
          id="market-search"
          className="input"
          placeholder="Symbol or company name — e.g. AAPL"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>

      {query.trim().length === 0 ? (
        <div className="empty-state">Type a symbol or company name to find an instrument.</div>
      ) : isFetching && !data ? (
        <div className="skeleton" style={{ height: 96 }} />
      ) : (data?.instruments ?? []).length === 0 ? (
        <div className="empty-state">No matches for “{query.trim()}”.</div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: "var(--space-2)",
          }}
        >
          {data!.instruments.map((i) => (
            <li key={i.symbol}>
              <Link href={`/i/${i.symbol}`} className="list-row">
                <SymbolLogo symbol={i.symbol} size={28} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{i.symbol}</strong>{" "}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {i.name}
                  </span>
                </span>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  {i.exchange}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
