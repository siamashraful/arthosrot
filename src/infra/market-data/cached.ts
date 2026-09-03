import { eq, inArray, sql } from "drizzle-orm";
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
    // Batch endpoint: cached per-symbol at BOTH layers — memo (this instance)
    // and the shared DB rows (other serverless instances) — so a watchlist
    // poll on a cold instance doesn't re-spend the vendor budget. Same
    // degradation as the single path: on vendor failure, expired rows serve,
    // flagged by their own embedded quote timestamps.
    const out = new Map<string, Quote>();
    const ttl = await this.quoteTtl();
    const now = this.clock.now().getTime();
    const misses: string[] = [];
    for (const s of symbols) {
      const sym = s.toUpperCase();
      const hit = this.memo.get(`quote:${sym}`);
      if (hit && hit.staleAfter > now) out.set(sym, hit.value as Quote);
      else misses.push(sym);
    }
    if (misses.length === 0) return out;

    const db = getDb();
    const rows = await db
      .select()
      .from(schema.marketDataCache)
      .where(
        inArray(
          schema.marketDataCache.cacheKey,
          misses.map((s) => `quote:${s}`),
        ),
      );
    const expired = new Map<string, Quote>();
    const uncached: string[] = [];
    for (const sym of misses) {
      const row = rows.find((r) => r.cacheKey === `quote:${sym}`);
      if (row && row.staleAfter.getTime() > now) {
        const value = deserializeQuote(row.payload as SerializedQuote);
        out.set(sym, value);
        this.memo.set(`quote:${sym}`, { value, staleAfter: row.staleAfter.getTime() });
      } else {
        if (row) expired.set(sym, deserializeQuote(row.payload as SerializedQuote));
        uncached.push(sym);
      }
    }
    if (uncached.length === 0) return out;

    try {
      const fresh = await this.inner.getQuotes(uncached);
      const staleAfter = new Date(now + ttl);
      for (const [sym, quote] of fresh) {
        out.set(sym, quote);
        this.memo.set(`quote:${sym}`, { value: quote, staleAfter: staleAfter.getTime() });
      }
      if (fresh.size > 0) {
        await db
          .insert(schema.marketDataCache)
          .values(
            [...fresh].map(([sym, quote]) => ({
              cacheKey: `quote:${sym}`,
              payload: serializeQuote(quote),
              fetchedAt: this.clock.now(),
              staleAfter,
            })),
          )
          .onConflictDoUpdate({
            target: schema.marketDataCache.cacheKey,
            set: {
              payload: sql`excluded.payload`,
              fetchedAt: sql`excluded.fetched_at`,
              staleAfter: sql`excluded.stale_after`,
            },
          });
      }
    } catch (err) {
      // Symbols with no cache at all stay absent from the map (callers
      // already render a missing quote honestly); only a total miss throws.
      if (expired.size === 0 && out.size === 0) {
        throw err instanceof ProviderUnavailableError
          ? err
          : new ProviderUnavailableError("market data unavailable", err);
      }
      for (const [sym, quote] of expired) out.set(sym, quote);
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
