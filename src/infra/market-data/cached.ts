import { eq } from "drizzle-orm";
import {
  ProviderUnavailableError,
  type Candle,
  type CandleRange,
  type InstrumentSummary,
  type MarketDataProvider,
  type MarketStatus,
  type Quote,
} from "@/core/market-data";
import { Px } from "@/core/money";
import type { Clock } from "@/core/shared";
import { getDb, schema } from "@/infra/db";

/**
 * Caching decorator (ADR-007): protects the 200 req/min free-tier limit and
 * degrades gracefully — on provider failure, a cached value is served (its
 * embedded quote timestamp keeps the UI honest about staleness). Cache is
 * DB-backed (serverless instances share it) + a best-effort in-memory memo.
 * Never used for execution decisions — display data only.
 */

const TTL_MS = {
  quoteOpen: 10_000,
  quoteClosed: 60_000,
  candlesIntraday: 60 * 60_000,
  candlesDaily: 24 * 60 * 60_000,
  status: 60_000,
} as const;

interface SerializedQuote {
  symbol: string;
  bid: string | null;
  bidSize: number | null;
  ask: string | null;
  askSize: number | null;
  last: string;
  ts: string;
  source: string;
}

function serializeQuote(q: Quote): SerializedQuote {
  return {
    symbol: q.symbol,
    bid: q.bid?.toString() ?? null,
    bidSize: q.bidSize,
    ask: q.ask?.toString() ?? null,
    askSize: q.askSize,
    last: q.last.toString(),
    ts: q.ts.toISOString(),
    source: q.source,
  };
}

function deserializeQuote(s: SerializedQuote): Quote {
  return {
    symbol: s.symbol,
    bid: s.bid ? Px.fromString(s.bid) : null,
    bidSize: s.bidSize,
    ask: s.ask ? Px.fromString(s.ask) : null,
    askSize: s.askSize,
    last: Px.fromString(s.last),
    ts: new Date(s.ts),
    source: s.source,
  };
}

export class CachedMarketData implements MarketDataProvider {
  private memo = new Map<string, { value: unknown; staleAfter: number }>();

  constructor(
    private readonly inner: MarketDataProvider,
    private readonly clock: Clock,
  ) {}

  private async withCache<T>(
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
    serialize: (v: T) => unknown,
    deserialize: (raw: unknown) => T,
  ): Promise<T> {
    const now = this.clock.now().getTime();

    const memoHit = this.memo.get(key);
    if (memoHit && memoHit.staleAfter > now) return memoHit.value as T;

    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.marketDataCache)
      .where(eq(schema.marketDataCache.cacheKey, key));
    if (row && row.staleAfter.getTime() > now) {
      const value = deserialize(row.payload);
      this.memo.set(key, { value, staleAfter: row.staleAfter.getTime() });
      return value;
    }

    try {
      const fresh = await load();
      const staleAfter = new Date(now + ttlMs);
      await db
        .insert(schema.marketDataCache)
        .values({
          cacheKey: key,
          payload: serialize(fresh),
          fetchedAt: this.clock.now(),
          staleAfter,
        })
        .onConflictDoUpdate({
          target: schema.marketDataCache.cacheKey,
          set: { payload: serialize(fresh), fetchedAt: this.clock.now(), staleAfter },
        });
      this.memo.set(key, { value: fresh, staleAfter: staleAfter.getTime() });
      return fresh;
    } catch (err) {
      // Graceful degradation: serve the expired cached value, flagged by its
      // own embedded timestamp (the UI renders staleness from quote.ts).
      if (row) return deserialize(row.payload);
      throw err instanceof ProviderUnavailableError
        ? err
        : new ProviderUnavailableError("market data unavailable", err);
    }
  }

  private async quoteTtl(): Promise<number> {
    const { status } = await this.getMarketStatus();
    return status === "OPEN" ? TTL_MS.quoteOpen : TTL_MS.quoteClosed;
  }

  search(query: string): Promise<InstrumentSummary[]> {
    return this.inner.search(query);
  }

  async getQuote(symbol: string): Promise<Quote> {
    const ttl = await this.quoteTtl();
    return this.withCache(
      `quote:${symbol.toUpperCase()}`,
      ttl,
      () => this.inner.getQuote(symbol),
      (q) => serializeQuote(q),
      (raw) => deserializeQuote(raw as SerializedQuote),
    );
  }

  async getQuotes(symbols: readonly string[]): Promise<Map<string, Quote>> {
    // Batch endpoint: cache per-symbol so mixed-freshness batches refetch minimally.
    const out = new Map<string, Quote>();
    const misses: string[] = [];
    const ttl = await this.quoteTtl();
    const now = this.clock.now().getTime();
    for (const s of symbols) {
      const hit = this.memo.get(`quote:${s.toUpperCase()}`);
      if (hit && hit.staleAfter > now) out.set(s.toUpperCase(), hit.value as Quote);
      else misses.push(s);
    }
    if (misses.length > 0) {
      const fresh = await this.inner.getQuotes(misses);
      const staleAfter = now + ttl;
      for (const [sym, quote] of fresh) {
        out.set(sym, quote);
        this.memo.set(`quote:${sym}`, { value: quote, staleAfter });
      }
    }
    return out;
  }

  getCandles(symbol: string, range: CandleRange): Promise<Candle[]> {
    const ttl = range === "1D" || range === "1W" ? TTL_MS.candlesIntraday : TTL_MS.candlesDaily;
    return this.withCache(
      `candles:${symbol.toUpperCase()}:${range}`,
      ttl,
      () => this.inner.getCandles(symbol, range),
      (c) => c,
      (raw) => raw as Candle[],
    );
  }

  async getMarketStatus(): Promise<{ status: MarketStatus; asOf: Date }> {
    // Pure calendar computation underneath — cheap, no vendor call; memo only.
    const key = "market-status";
    const now = this.clock.now().getTime();
    const hit = this.memo.get(key);
    if (hit && hit.staleAfter > now) {
      return hit.value as { status: MarketStatus; asOf: Date };
    }
    const value = await this.inner.getMarketStatus();
    this.memo.set(key, { value, staleAfter: now + TTL_MS.status });
    return value;
  }
}
