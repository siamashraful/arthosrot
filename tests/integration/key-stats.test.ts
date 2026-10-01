import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/infra/db";
import { companyFundamentals } from "@/infra/db/repositories/company-fundamentals";
import { getInstrumentStats } from "@/server/api/key-stats";
import { truncateAll } from "./helpers";

/**
 * Instrument key stats against Postgres + the fixture feed (AAPL last =
 * 200.0000): market cap from stored shares × last, P/E from cached EPS
 * (SEC_USER_AGENT unset ⇒ no refresh), 52-week range from fixture candles.
 */

beforeEach(truncateAll);
afterAll(closeDb);

async function seed(symbol: string, shares: string, eps: string | null) {
  await companyFundamentals.upsertShares([
    {
      symbol,
      cik: "320193",
      name: "Apple",
      shares,
      sharesAsOf: "2026-07-17",
      sharesBasis: "cover",
    },
  ]);
  if (eps) {
    await companyFundamentals.saveEps(
      "320193",
      { eps, basis: "ttm", periodEnd: "2026-06-30" },
      new Date(),
    );
  }
}

describe("instrument key stats", () => {
  it("market cap = shares × last; P/E = last ÷ TTM EPS; 52-week range from bars", async () => {
    await seed("AAPL", "14594180000", "7.9000");
    const stats = (await getInstrumentStats("aapl")) as Record<string, unknown>;
    expect(stats).toMatchObject({
      symbol: "AAPL",
      marketCap: "2918836000000.00",
      sharesAsOf: "2026-07-17",
      pe: "25.3",
      peBasis: "ttm",
      peNotMeaningful: false,
    });
    const range = stats.week52 as { high: string; low: string };
    expect(Number(range.high)).toBeGreaterThanOrEqual(200);
    expect(Number(range.low)).toBeLessThanOrEqual(200);
  });

  it("negative earnings: no P/E, flagged not meaningful", async () => {
    await seed("AAPL", "14594180000", "-0.4000");
    expect(await getInstrumentStats("AAPL")).toMatchObject({ pe: null, peNotMeaningful: true });
  });

  it("no fundamentals yet: price-derived stats still render", async () => {
    expect(await getInstrumentStats("AAPL")).toMatchObject({
      marketCap: null,
      pe: null,
      peNotMeaningful: false,
      week52: expect.objectContaining({ high: expect.any(String) }),
    });
  });

  it("the EPS of a company reaches every listed class", async () => {
    await companyFundamentals.upsertShares([
      {
        symbol: "GOOGL",
        cik: "1652044",
        name: "Alphabet",
        shares: "12151000000",
        sharesAsOf: "2026-06-30",
        sharesBasis: "weighted-average",
      },
      {
        symbol: "GOOG",
        cik: "1652044",
        name: "Alphabet",
        shares: "12151000000",
        sharesAsOf: "2026-06-30",
        sharesBasis: "weighted-average",
      },
    ]);
    await companyFundamentals.saveEps(
      "1652044",
      { eps: "11.5000", basis: "ttm", periodEnd: "2026-06-30" },
      new Date(),
    );
    expect((await companyFundamentals.get("GOOG"))?.epsTtm).toBe("11.5000");
  });
});
