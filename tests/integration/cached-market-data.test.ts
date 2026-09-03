import { afterAll, beforeEach, describe, expect, it } from "vitest";
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
import { closeDb } from "@/infra/db";
import { CachedMarketData } from "@/infra/market-data";
import { truncateAll } from "./helpers";

/**
 * The batch-quote path through the shared DB cache. This pins two production
 * behaviors that were broken before the refactor: cold instances must reuse
 * rows another instance wrote (vendor budget), and a vendor failure must
 * degrade to expired rows instead of failing the whole watchlist.
 */

function quote(symbol: string, last: string, ts: Date): Quote {
  return {
    symbol,
    bid: null,
    bidSize: null,
    ask: null,
    askSize: null,
    last: Px.fromString(last),
    ts,
    source: "test",
  };
}

class ScriptedProvider implements MarketDataProvider {
  batchCalls = 0;
  failBatch = false;
  constructor(private readonly clock: Clock) {}

  async search(): Promise<InstrumentSummary[]> {
    return [];
  }
  async getQuote(symbol: string): Promise<Quote> {
    const map = await this.getQuotes([symbol]);
    const q = map.get(symbol);
    if (!q) throw new ProviderUnavailableError("no quote");
    return q;
  }
  async getQuotes(symbols: readonly string[]): Promise<Map<string, Quote>> {
    this.batchCalls += 1;
    if (this.failBatch) throw new ProviderUnavailableError("scripted outage");
    return new Map(symbols.map((s) => [s, quote(s, "100.0000", this.clock.now())]));
  }
  async getCandles(_symbol: string, _range: CandleRange): Promise<Candle[]> {
    return [];
  }
  async getMarketStatus(): Promise<{ status: MarketStatus; asOf: Date }> {
    return { status: "OPEN", asOf: this.clock.now() };
  }
}

describe("CachedMarketData batch quotes", () => {
  let nowMs: number;
  const clock: Clock = { now: () => new Date(nowMs) };

  beforeEach(async () => {
    await truncateAll();
    nowMs = Date.parse("2026-09-03T15:00:00Z");
  });
  afterAll(closeDb);

  it("a cold instance serves from the shared DB rows another instance wrote", async () => {
    const inner = new ScriptedProvider(clock);
    const warm = new CachedMarketData(inner, clock);
    await warm.getQuotes(["AAPL", "MSFT"]);
    expect(inner.batchCalls).toBe(1);

    // Fresh instance = empty memo, same DB. Within TTL: no vendor call.
    const cold = new CachedMarketData(inner, clock);
    const served = await cold.getQuotes(["AAPL", "MSFT"]);
    expect(inner.batchCalls).toBe(1);
    expect(served.get("AAPL")?.last.toString()).toBe("100.0000");
    expect(served.get("MSFT")).toBeDefined();
  });

  it("degrades to expired rows on vendor failure instead of failing the batch", async () => {
    const inner = new ScriptedProvider(clock);
    const cache = new CachedMarketData(inner, clock);
    await cache.getQuotes(["AAPL"]);

    nowMs += 60 * 60_000; // well past the quote TTL
    inner.failBatch = true;
    const cold = new CachedMarketData(inner, clock);
    const served = await cold.getQuotes(["AAPL"]);
    expect(served.get("AAPL")?.last.toString()).toBe("100.0000");
    // The stale timestamp stays embedded — the UI's honesty carrier.
    expect(served.get("AAPL")?.ts.toISOString()).toBe("2026-09-03T15:00:00.000Z");
  });

  it("throws ProviderUnavailableError only when nothing at all can be served", async () => {
    const inner = new ScriptedProvider(clock);
    inner.failBatch = true;
    const cache = new CachedMarketData(inner, clock);
    await expect(cache.getQuotes(["ZZZZ"])).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});
