import { downsampleSeries } from "@/core/discovery";
import { displayFreshness, type DisplayFreshness, type Quote } from "@/core/market-data";
import { systemClock } from "@/core/shared";
import { watchlistsRepository } from "@/infra/db/repositories/watchlists";
import { pgTransactionRunner } from "@/infra/db/tx";
import type { SessionInfo } from "../session";
import { getContainer } from "../container";
import { serializeQuote } from "./market";
import { dayChangePeriod } from "./movers";

/**
 * Watchlist quotes (/api/v1/watchlist/quotes): for the caller's OWN watchlist
 * only, each symbol's quote (with day change) and a sparkline — the latest
 * session's 1D closes thinned to ≤ 40 points, as the provider's decimal
 * strings. One batched quote call; candles per symbol (the shared candle
 * cache) with a concurrency cap. A symbol the feed can't quote gets
 * quote:null; a candle failure only costs that row its sparkline (null) —
 * never the response.
 */

export const CANDLE_CONCURRENCY = 6;

/** map() with at most `limit` calls in flight; results keep input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function sparklineFor(symbol: string): Promise<string[] | null> {
  try {
    const candles = await getContainer().marketData.getCandles(symbol, "1D");
    const closes = downsampleSeries(candles.map((c) => c.close));
    return closes.length >= 2 ? closes : null;
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "watchlist sparkline unavailable",
        symbol,
        err: String(err),
      }),
    );
    return null;
  }
}

export async function getWatchlistQuotes(session: SessionInfo): Promise<unknown> {
  const rows = await pgTransactionRunner.run(async (tx) => {
    const watchlistId = await watchlistsRepository.getOrCreateForUser(tx, session.userId);
    return watchlistsRepository.list(tx, watchlistId);
  });
  const symbols = [...new Set(rows.map((r) => r.symbol))];
  const { marketData } = getContainer();
  const [quotes, market] = await Promise.all([
    symbols.length > 0 ? marketData.getQuotes(symbols) : new Map<string, Quote>(),
    marketData.getMarketStatus(),
  ]);
  // No price → no sparkline worth drawing; skip the candle call entirely.
  const sparklines = await mapWithConcurrency(symbols, CANDLE_CONCURRENCY, (s) =>
    quotes.has(s) ? sparklineFor(s) : Promise.resolve(null),
  );
  const sparkBySymbol = new Map(symbols.map((s, i) => [s, sparklines[i] ?? null]));

  // One chip for the list: the stalest quote governs.
  const oldest = [...quotes.values()].sort((a, b) => a.ts.getTime() - b.ts.getTime())[0];
  const freshness: DisplayFreshness | null = oldest
    ? displayFreshness(oldest, systemClock.now(), market.status)
    : null;

  return {
    items: symbols.map((symbol) => {
      const quote = quotes.get(symbol);
      return {
        symbol,
        quote: quote ? serializeQuote(quote) : null,
        sparkline: sparkBySymbol.get(symbol) ?? null,
      };
    }),
    period: dayChangePeriod(market.status),
    market: { status: market.status, asOf: market.asOf.toISOString() },
    freshness,
    freshnessTs: oldest?.ts.toISOString() ?? null,
    source: oldest?.source ?? null,
  };
}
