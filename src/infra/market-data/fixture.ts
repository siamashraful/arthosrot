import {
  marketStatusAt,
  UnknownSymbolError,
  type Candle,
  type CandleRange,
  type InstrumentSummary,
  type MarketDataProvider,
  type MarketStatus,
  type Quote,
} from "@/core/market-data";
import { Px } from "@/core/money";
import type { Clock } from "@/core/shared";

/**
 * Deterministic market data for tests, CI, and offline development.
 * Prices are fixed (settable in tests); candles are generated from a seeded
 * PRNG per symbol, so every run of every scenario is exactly reproducible.
 */

export interface FixtureInstrument {
  symbol: string;
  name: string;
  exchange: string;
  price: string; // Px string
}

export const DEFAULT_FIXTURES: FixtureInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", price: "200.0000" },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", price: "410.5000" },
  { symbol: "GOOGL", name: "Alphabet Inc. Class A", exchange: "NASDAQ", price: "175.2500" },
  { symbol: "AMZN", name: "Amazon.com Inc.", exchange: "NASDAQ", price: "185.7500" },
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", price: "120.4000" },
  { symbol: "META", name: "Meta Platforms Inc.", exchange: "NASDAQ", price: "495.0000" },
  { symbol: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ", price: "245.3000" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE", price: "205.1000" },
  { symbol: "V", name: "Visa Inc.", exchange: "NYSE", price: "280.9000" },
  { symbol: "KO", name: "The Coca-Cola Company", exchange: "NYSE", price: "63.2500" },
];

const RANGE_BARS: Record<CandleRange, { count: number; stepMs: number }> = {
  "1D": { count: 78, stepMs: 5 * 60_000 },
  "1W": { count: 65, stepMs: 60 * 60_000 },
  "1M": { count: 22, stepMs: 24 * 60 * 60_000 },
  "3M": { count: 66, stepMs: 24 * 60 * 60_000 },
  "1Y": { count: 252, stepMs: 24 * 60 * 60_000 },
  "5Y": { count: 260, stepMs: 7 * 24 * 60 * 60_000 },
};

/** Tiny deterministic PRNG (mulberry32) seeded per symbol. */
function seeded(seedStr: string): () => number {
  let seed = 0;
  for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class FixtureProvider implements MarketDataProvider {
  private readonly bySymbol = new Map<string, FixtureInstrument>();
  private statusOverride: MarketStatus | null = null;
  private quoteTsOverride: Date | null = null;

  constructor(
    private readonly clock: Clock,
    fixtures: FixtureInstrument[] = DEFAULT_FIXTURES,
  ) {
    for (const f of fixtures) this.bySymbol.set(f.symbol, { ...f });
  }

  /** Test hook: move a price deterministically. */
  setPrice(symbol: string, price: string): void {
    const f = this.bySymbol.get(symbol);
    if (!f) throw new UnknownSymbolError(symbol);
    f.price = Px.fromString(price).toString();
  }

  /** Test hook: force market status regardless of the calendar. */
  setMarketStatus(status: MarketStatus | null): void {
    this.statusOverride = status;
  }

  /** Test hook: force quote timestamps (staleness scenarios). */
  setQuoteTimestamp(ts: Date | null): void {
    this.quoteTsOverride = ts;
  }

  async search(query: string): Promise<InstrumentSummary[]> {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return [...this.bySymbol.values()]
      .filter((f) => f.symbol.startsWith(q) || f.name.toUpperCase().includes(q))
      .slice(0, 10)
      .map(({ symbol, name, exchange }) => ({ symbol, name, exchange }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const f = this.bySymbol.get(symbol.toUpperCase());
    if (!f) throw new UnknownSymbolError(symbol);
    const last = Px.fromString(f.price);
    const spread = last.toDecimal().mul("0.0005").toDecimalPlaces(4);
    const ts = this.quoteTsOverride ?? this.clock.now();
    return {
      symbol: f.symbol,
      bid: Px.fromString(last.toDecimal().minus(spread).toFixed(4)),
      bidSize: 100,
      ask: Px.fromString(last.toDecimal().plus(spread).toFixed(4)),
      askSize: 100,
      last,
      ts,
      source: "fixture",
    };
  }

  async getQuotes(symbols: readonly string[]): Promise<Map<string, Quote>> {
    const out = new Map<string, Quote>();
    for (const s of symbols) {
      try {
        out.set(s.toUpperCase(), await this.getQuote(s));
      } catch (err) {
        if (!(err instanceof UnknownSymbolError)) throw err;
      }
    }
    return out;
  }

  async getCandles(symbol: string, range: CandleRange): Promise<Candle[]> {
    const f = this.bySymbol.get(symbol.toUpperCase());
    if (!f) throw new UnknownSymbolError(symbol);
    const { count, stepMs } = RANGE_BARS[range];
    const rand = seeded(`${f.symbol}:${range}`);
    const end = this.clock.now().getTime();
    const candles: Candle[] = [];
    let price = Number(f.price);
    // Walk backwards from the fixed current price so the series always ends at it.
    const closes: number[] = [price];
    for (let i = 1; i < count; i++) {
      price = price / (1 + (rand() - 0.495) * 0.02);
      closes.push(price);
    }
    closes.reverse();
    for (let i = 0; i < count; i++) {
      const close = closes[i]!;
      const open = i === 0 ? close : closes[i - 1]!;
      const high = Math.max(open, close) * (1 + rand() * 0.005);
      const low = Math.min(open, close) * (1 - rand() * 0.005);
      candles.push({
        time: new Date(end - (count - 1 - i) * stepMs).toISOString(),
        open: open.toFixed(4),
        high: high.toFixed(4),
        low: low.toFixed(4),
        close: close.toFixed(4),
        volume: Math.floor(rand() * 1_000_000),
      });
    }
    return candles;
  }

  async getMarketStatus(): Promise<{ status: MarketStatus; asOf: Date }> {
    const asOf = this.clock.now();
    return { status: this.statusOverride ?? marketStatusAt(asOf), asOf };
  }
}
