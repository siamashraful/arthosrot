import { describe, expect, it } from "vitest";
import type { MarketDataProvider } from "@/core/market-data";
import { UnknownSymbolError } from "@/core/market-data";

/**
 * MarketDataProvider contract suite (ADR-007): every implementation must pass.
 * Runs against FixtureProvider always, and against AlpacaMarketData via
 * recorded responses (never live in CI).
 */
export function marketDataProviderContract(
  name: string,
  makeProvider: () => MarketDataProvider,
  opts: { knownSymbol: string; searchable: boolean },
): void {
  describe(`MarketDataProvider contract: ${name}`, () => {
    it("returns a fully-formed quote for a known symbol", async () => {
      const quote = await makeProvider().getQuote(opts.knownSymbol);
      expect(quote.symbol).toBe(opts.knownSymbol);
      expect(quote.last.toString()).toMatch(/^\d+\.\d{4}$/);
      expect(quote.ts).toBeInstanceOf(Date);
      expect(Number.isNaN(quote.ts.getTime())).toBe(false);
      expect(quote.source.length).toBeGreaterThan(0);
      if (quote.bid) expect(quote.bid.toString()).toMatch(/^\d+\.\d{4}$/);
      if (quote.ask) expect(quote.ask.toString()).toMatch(/^\d+\.\d{4}$/);
    });

    it("throws UnknownSymbolError for junk symbols", async () => {
      await expect(makeProvider().getQuote("ZZZZZZZZ")).rejects.toThrow(UnknownSymbolError);
    });

    it("batch quotes cover the requested symbols that exist", async () => {
      const map = await makeProvider().getQuotes([opts.knownSymbol, "ZZZZZZZZ"]);
      expect(map.has(opts.knownSymbol)).toBe(true);
      expect(map.has("ZZZZZZZZ")).toBe(false);
    });

    it("returns candles sorted ascending with coherent OHLC", async () => {
      const candles = await makeProvider().getCandles(opts.knownSymbol, "1M");
      expect(candles.length).toBeGreaterThan(5);
      for (let i = 1; i < candles.length; i++) {
        expect(new Date(candles[i]!.time).getTime()).toBeGreaterThan(
          new Date(candles[i - 1]!.time).getTime(),
        );
      }
      for (const c of candles) {
        const [o, h, l, cl] = [c.open, c.high, c.low, c.close].map(Number);
        expect(h).toBeGreaterThanOrEqual(Math.max(o!, cl!) - 1e-9);
        expect(l).toBeLessThanOrEqual(Math.min(o!, cl!) + 1e-9);
        expect(c.volume).toBeGreaterThanOrEqual(0);
      }
    });

    it("reports a market status with a timestamp", async () => {
      const { status, asOf } = await makeProvider().getMarketStatus();
      expect(["OPEN", "CLOSED", "PRE", "POST"]).toContain(status);
      expect(asOf).toBeInstanceOf(Date);
    });

    if (opts.searchable) {
      it("search finds the known symbol", async () => {
        const results = await makeProvider().search(opts.knownSymbol);
        expect(results.some((r) => r.symbol === opts.knownSymbol)).toBe(true);
      });
    }
  });
}
