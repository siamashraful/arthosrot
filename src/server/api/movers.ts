import { rankMovers, SECTORS } from "@/core/discovery";
import {
  dayChange,
  displayFreshness,
  type DisplayFreshness,
  type MarketStatus,
  type Quote,
} from "@/core/market-data";
import { systemClock } from "@/core/shared";
import { getContainer } from "../container";
import { loadTop100 } from "./discovery";
import { serializeQuote } from "./market";

/**
 * Top movers (/api/v1/browse/movers): the day's five biggest gainers and
 * losers by percent change vs the previous close, across the Search page's
 * browse universe — the current Top 100 (latest snapshot, seed fallback) plus
 * every sector-catalog symbol. One batched quote call (the shared cache);
 * ranking is core's exact-decimal rankMovers. Display data only.
 *
 * `period` names what the change covers: "today" during the trading day,
 * "last-session" once the market is CLOSED (the same rule the list pages use
 * for their sr-only "today" / "last session" suffix).
 */

export type DayChangePeriod = "today" | "last-session";

export function dayChangePeriod(status: MarketStatus): DayChangePeriod {
  return status === "CLOSED" ? "last-session" : "today";
}

/** The movers universe: Top 100 ∪ sector catalog, de-duplicated (first name wins). */
export async function moversUniverse(): Promise<Array<{ symbol: string; name: string }>> {
  // Top 100 names are already curated (loadTop100); sector names are curated.
  const top100 = (await loadTop100()).entries.map((e) => ({ symbol: e.symbol, name: e.name }));
  const all = [...top100, ...SECTORS.flatMap((s) => s.companies)];
  const seen = new Set<string>();
  return all.filter((r) => {
    if (seen.has(r.symbol)) return false;
    seen.add(r.symbol);
    return true;
  });
}

export async function getMovers(): Promise<unknown> {
  const universe = await moversUniverse();
  const { marketData } = getContainer();
  const [quotes, market] = await Promise.all([
    marketData.getQuotes(universe.map((r) => r.symbol)),
    marketData.getMarketStatus(),
  ]);

  const candidates: Array<{ symbol: string; name: string; percent: string; quote: Quote }> = [];
  for (const r of universe) {
    const quote = quotes.get(r.symbol);
    const change = quote ? dayChange(quote) : null;
    if (quote && change) candidates.push({ ...r, percent: change.percent, quote });
  }
  const { gainers, losers } = rankMovers(candidates);

  // One chip for the section: the stalest quote it displays governs.
  const shown = [...gainers, ...losers].map((r) => r.quote);
  const oldest = shown.sort((a, b) => a.ts.getTime() - b.ts.getTime())[0];
  const now = systemClock.now();
  const freshness: DisplayFreshness | null = oldest
    ? displayFreshness(oldest, now, market.status)
    : null;

  const row = (r: (typeof candidates)[number]) => {
    const quote = serializeQuote(r.quote);
    return { symbol: r.symbol, name: r.name, quote, dayChange: quote.dayChange };
  };

  return {
    gainers: gainers.map(row),
    losers: losers.map(row),
    period: dayChangePeriod(market.status),
    asOf: now.toISOString(),
    market: { status: market.status, asOf: market.asOf.toISOString() },
    freshness,
    freshnessTs: oldest?.ts.toISOString() ?? null,
    source: oldest?.source ?? null,
  };
}
