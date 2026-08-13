"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";

export default function MarketsPage() {
  const [query, setQuery] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["instrument-search", query],
    queryFn: () => api.searchInstruments(query),
    enabled: query.trim().length > 0,
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
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {data!.instruments.map((i) => (
            <li key={i.symbol} style={{ borderBottom: "1px solid var(--border)" }}>
              <Link
                href={`/i/${i.symbol}`}
                className="nav-link"
                style={{ justifyContent: "space-between" }}
              >
                <span>
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
