"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
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
    <div style={{ display: "grid", gap: 16, maxWidth: "40rem" }}>
      <div className="ar-appbar">
        <h1 className="ar-appbar__title">Markets</h1>
      </div>

      <div className="ar-field">
        <label className="ar-field__label" htmlFor="market-search">
          Search US equities
        </label>
        <div className="ar-input ar-input--search">
          <Search className="ar-icon" size={20} aria-hidden />
          <input
            id="market-search"
            placeholder="Symbol or company name — e.g. AAPL"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      {query.trim().length === 0 ? (
        <div className="ar-card">
          <div className="ar-empty">
            <span className="ar-empty__text">
              Type a symbol or company name to find an instrument.
            </span>
          </div>
        </div>
      ) : isFetching && !data ? (
        <div className="ar-card ar-card--list" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="ar-skel-row">
              <span className="ar-skel ar-skel--chip" />
              <div className="ar-skel-row__main">
                <span className="ar-skel ar-skel--text" style={{ width: "30%" }} />
                <span className="ar-skel ar-skel--text" style={{ width: "55%" }} />
              </div>
            </div>
          ))}
        </div>
      ) : (data?.instruments ?? []).length === 0 ? (
        <div className="ar-card">
          <div className="ar-empty">
            <span className="ar-empty__text">No matches for “{query.trim()}”.</span>
          </div>
        </div>
      ) : (
        <ul className="ar-card ar-card--list ar-list" style={{ listStyle: "none", margin: 0 }}>
          {(data?.instruments ?? []).map((i) => (
            <li key={i.symbol}>
              <Link href={`/i/${i.symbol}`} className="ar-row">
                <SymbolLogo symbol={i.symbol} size={40} />
                <span className="ar-row__main">
                  <span className="ar-row__title">{i.symbol}</span>
                  <span className="ar-row__sub">{i.name}</span>
                </span>
                <span className="ar-row__end">
                  <span className="ar-tag ar-tag--sky">{i.exchange}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
