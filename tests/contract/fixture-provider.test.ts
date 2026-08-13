import { describe, expect, it } from "vitest";
import type { Clock } from "@/core/shared";
import { FixtureProvider } from "@/infra/market-data";
import { marketDataProviderContract } from "./market-data-provider";

const fixedClock: Clock = { now: () => new Date("2026-01-06T15:00:00Z") };

marketDataProviderContract("FixtureProvider", () => new FixtureProvider(fixedClock), {
  knownSymbol: "AAPL",
  searchable: true,
});

describe("FixtureProvider determinism", () => {
  it("produces identical candle series on every call (golden reproducibility)", async () => {
    const a = await new FixtureProvider(fixedClock).getCandles("AAPL", "1Y");
    const b = await new FixtureProvider(fixedClock).getCandles("AAPL", "1Y");
    expect(a).toEqual(b);
  });

  it("candle series ends at the fixed current price", async () => {
    const candles = await new FixtureProvider(fixedClock).getCandles("AAPL", "1M");
    expect(Number(candles.at(-1)!.close)).toBeCloseTo(200, 4);
  });

  it("setPrice moves quotes deterministically (test hook)", async () => {
    const provider = new FixtureProvider(fixedClock);
    provider.setPrice("AAPL", "190.0000");
    const quote = await provider.getQuote("AAPL");
    expect(quote.last.toString()).toBe("190.0000");
  });

  it("quotes carry the injected clock's timestamp", async () => {
    const quote = await new FixtureProvider(fixedClock).getQuote("AAPL");
    expect(quote.ts.toISOString()).toBe("2026-01-06T15:00:00.000Z");
  });
});
