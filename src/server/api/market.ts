import { z } from "zod";
import { displayFreshness, UnknownSymbolError, type Quote } from "@/core/market-data";
import { systemClock } from "@/core/shared";
import { getContainer } from "../container";

/** Serialization for /api/v1 market surfaces — money/prices as strings. */

const searchSchema = z.object({ query: z.string().min(1).max(40) });
const candleRangeSchema = z.enum(["1D", "1W", "1M", "3M", "1Y", "5Y"]);
/** The one ticker-symbol input schema — every /api/v1 surface validates with this. */
export const symbolSchema = z
  .string()
  .min(1)
  .max(10)
  .regex(/^[A-Za-z.\-]+$/);
const symbolsSchema = z
  .string()
  .transform((s) => s.split(",").map((x) => x.trim()))
  .pipe(z.array(symbolSchema).min(1).max(25));

export function serializeQuote(quote: Quote) {
  return {
    symbol: quote.symbol,
    bid: quote.bid?.toString() ?? null,
    bidSize: quote.bidSize,
    ask: quote.ask?.toString() ?? null,
    askSize: quote.askSize,
    last: quote.last.toString(),
    ts: quote.ts.toISOString(),
    source: quote.source,
  };
}

export async function searchInstruments(request: Request): Promise<unknown> {
  const url = new URL(request.url);
  const { query } = searchSchema.parse({ query: url.searchParams.get("query") ?? "" });
  const instruments = await getContainer().instrumentService.search(query);
  return { instruments };
}

export async function getInstrumentDetail(symbolRaw: string): Promise<unknown> {
  const symbol = symbolSchema.parse(symbolRaw).toUpperCase();
  const { instrumentService, marketData } = getContainer();
  const instrument = await instrumentService.getOrRegister(symbol);
  // A KNOWN instrument whose feed quote is gone (delisting window) must not
  // 404 — this page hosts the only trading ticket, and a holder must always
  // be able to SELL. quote:null is the honest answer; garbage symbols still
  // 404 inside getOrRegister above.
  const [quote, market] = await Promise.all([
    marketData.getQuote(symbol).catch((err) => {
      if (err instanceof UnknownSymbolError) return null;
      throw err;
    }),
    marketData.getMarketStatus(),
  ]);
  return {
    instrument,
    quote: quote ? serializeQuote(quote) : null,
    market: { status: market.status, asOf: market.asOf.toISOString() },
    freshness: quote ? displayFreshness(quote, systemClock.now(), market.status) : null,
  };
}

export async function getInstrumentCandles(symbolRaw: string, rangeRaw: string): Promise<unknown> {
  const symbol = symbolSchema.parse(symbolRaw).toUpperCase();
  const range = candleRangeSchema.parse(rangeRaw);
  const candles = await getContainer().marketData.getCandles(symbol, range);
  return { symbol, range, candles, asOf: systemClock.now().toISOString() };
}

export async function getBatchQuotes(request: Request): Promise<unknown> {
  const url = new URL(request.url);
  const symbols = symbolsSchema.parse(url.searchParams.get("symbols") ?? "");
  const { marketData } = getContainer();
  const [quotes, market] = await Promise.all([
    marketData.getQuotes(symbols.map((s) => s.toUpperCase())),
    marketData.getMarketStatus(),
  ]);
  return {
    quotes: Object.fromEntries([...quotes.entries()].map(([s, q]) => [s, serializeQuote(q)])),
    market: { status: market.status, asOf: market.asOf.toISOString() },
  };
}
