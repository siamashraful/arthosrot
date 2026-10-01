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
  // Shape recorded from the live IEX feed 2026-09-30: top-level keys are the
  // symbols; unknown symbols are absent.
  "/v2/stocks/snapshots": {
    AAPL: {
      latestQuote: { bp: 199.98, bs: 3, ap: 200.03, as: 2, t: "2026-01-06T14:59:58.123Z" },
      latestTrade: { p: 200.01, t: "2026-01-06T14:59:59.456Z" },
      dailyBar: { o: 197.5, h: 200.4, l: 197.1, c: 200.01, v: 900, t: "2026-01-06T05:00:00Z" },
      prevDailyBar: { o: 196, h: 198, l: 195.5, c: 197.42, v: 1100, t: "2026-01-05T05:00:00Z" },
    },
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

  it("carries the previous session close for day change", async () => {
    const quote = await provider().getQuote("AAPL");
    expect(quote.previousClose?.toString()).toBe("197.4200");
  });

  it("pre-market on a new day: the latest daily bar IS the previous session", async () => {
    const preMarket = provider(async () =>
      Response.json({
        AAPL: {
          latestTrade: { p: 201.5, t: "2026-01-07T12:30:00Z" }, // Wed 7:30 ET
          dailyBar: { o: 197.5, h: 200.4, l: 197.1, c: 200.01, v: 900, t: "2026-01-06T05:00:00Z" },
          prevDailyBar: { o: 196, h: 198, l: 195.5, c: 197.42, v: 1, t: "2026-01-05T05:00:00Z" },
        },
      }),
    );
    expect((await preMarket.getQuote("AAPL")).previousClose?.toString()).toBe("200.0100");
  });

  it("has no previous close when the feed has no prior session", async () => {
    const fresh = provider(async () =>
      Response.json({ AAPL: { latestTrade: { p: 20, t: "2026-01-06T14:59:59Z" } } }),
    );
    expect((await fresh.getQuote("AAPL")).previousClose).toBeNull();
  });

  it("asks for every symbol in one snapshot call per batch", async () => {
    const urls: string[] = [];
    const batch = provider(async (url) => {
      urls.push(url);
      return Response.json({});
    });
    await batch.getQuotes(Array.from({ length: 450 }, (_, i) => `S${i}`));
    expect(urls).toHaveLength(3); // 200 + 200 + 50
    expect(urls.every((u) => new URL(u).pathname === "/v2/stocks/snapshots")).toBe(true);
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

  it("1D is the latest session, even when the last 24h hold no bars (weekend)", async () => {
    let requested = "";
    const weekend = provider(async (url) => {
      requested = url;
      return new Response(
        JSON.stringify({
          bars: {
            AAPL: [
              // Thursday's session, then Friday's (ET) — requested on a Sunday
              { o: 1, h: 1, l: 1, c: 1, v: 1, t: "2026-01-01T20:55:00Z" },
              { o: 2, h: 2, l: 2, c: 2, v: 1, t: "2026-01-02T14:30:00Z" },
              { o: 3, h: 3, l: 3, c: 3, v: 1, t: "2026-01-02T20:55:00Z" },
            ],
          },
        }),
        { status: 200 },
      );
    });
    const candles = await weekend.getCandles("AAPL", "1D");
    expect(candles.map((c) => c.close)).toEqual(["2.0000", "3.0000"]);
    const start = new URL(requested).searchParams.get("start")!;
    // reaches back past a long weekend, not just 24h
    expect(fixedClock.now().getTime() - Date.parse(start)).toBeGreaterThanOrEqual(4 * 86_400_000);
  });

  it("maps 5xx to ProviderUnavailableError", async () => {
    const failing = provider(makeFetch({ "/v2/stocks/snapshots": { status: 500 } }));
    await expect(failing.getQuote("AAPL")).rejects.toThrow(ProviderUnavailableError);
  });

  it("maps network failure to ProviderUnavailableError", async () => {
    const failing = provider(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(failing.getQuote("AAPL")).rejects.toThrow(ProviderUnavailableError);
  });
});
