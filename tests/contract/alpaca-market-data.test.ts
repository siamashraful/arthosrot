import { describe, expect, it } from "vitest";
import { ProviderUnavailableError, UnknownSymbolError } from "@/core/market-data";
import type { Clock } from "@/core/shared";
import { AlpacaMarketData, type FetchFn } from "@/infra/market-data";

/**
 * Alpaca adapter translation tests against RECORDED response shapes — the
 * CI-safe stand-in for the live API (docs/architecture/EXECUTION.md testing
 * contract). CI never talks to live Alpaca.
 */

const fixedClock: Clock = { now: () => new Date("2026-01-06T15:00:00Z") };

const recorded: Record<string, unknown> = {
  "/v2/stocks/quotes/latest": {
    quotes: { AAPL: { bp: 199.98, bs: 3, ap: 200.03, as: 2, t: "2026-01-06T14:59:58.123Z" } },
  },
  "/v2/stocks/trades/latest": {
    trades: { AAPL: { p: 200.01, t: "2026-01-06T14:59:59.456Z" } },
  },
  "/v2/stocks/bars": {
    bars: {
      AAPL: [
        { o: 198.1, h: 199.5, l: 197.9, c: 199.2, v: 1000, t: "2026-01-02T05:00:00Z" },
        { o: 199.2, h: 200.4, l: 198.8, c: 200.01, v: 1200, t: "2026-01-05T05:00:00Z" },
      ],
    },
  },
};

function makeFetch(overrides: Record<string, { status: number; body?: unknown }> = {}): FetchFn {
  return async (url) => {
    const path = new URL(url).pathname;
    const override = overrides[path];
    if (override) {
      return new Response(JSON.stringify(override.body ?? {}), { status: override.status });
    }
    const body = recorded[path];
    if (!body) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  };
}

function provider(fetchFn: FetchFn = makeFetch()): AlpacaMarketData {
  return new AlpacaMarketData(fixedClock, "key", "secret", fetchFn);
}

describe("AlpacaMarketData translation (recorded responses)", () => {
  it("merges latest quote + latest trade into a canonical Quote", async () => {
    const quote = await provider().getQuote("AAPL");
    expect(quote.last.toString()).toBe("200.0100");
    expect(quote.bid?.toString()).toBe("199.9800");
    expect(quote.ask?.toString()).toBe("200.0300");
    expect(quote.bidSize).toBe(3);
    expect(quote.ts.toISOString()).toBe("2026-01-06T14:59:59.456Z");
    expect(quote.source).toBe("IEX via Alpaca");
  });

  it("throws UnknownSymbolError when the feed has no trade for the symbol", async () => {
    await expect(provider().getQuote("ZZZZZZZZ")).rejects.toThrow(UnknownSymbolError);
  });

  it("translates bars into canonical candles (4dp strings, ISO times)", async () => {
    const candles = await provider().getCandles("AAPL", "1M");
    expect(candles).toHaveLength(2);
    expect(candles[0]).toEqual({
      time: "2026-01-02T05:00:00.000Z",
      open: "198.1000",
      high: "199.5000",
      low: "197.9000",
      close: "199.2000",
      volume: 1000,
    });
  });

  it("maps 5xx to ProviderUnavailableError", async () => {
    const failing = provider(makeFetch({ "/v2/stocks/trades/latest": { status: 500 } }));
    await expect(failing.getQuote("AAPL")).rejects.toThrow(ProviderUnavailableError);
  });

  it("maps network failure to ProviderUnavailableError", async () => {
    const failing = provider(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(failing.getQuote("AAPL")).rejects.toThrow(ProviderUnavailableError);
  });
});
