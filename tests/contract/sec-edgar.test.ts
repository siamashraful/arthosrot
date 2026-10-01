import { describe, expect, it } from "vitest";
import { ProviderUnavailableError } from "@/core/market-data";
import { recentQuarters, SecEdgarShares, type SecFetch } from "@/infra/sec-edgar";

/**
 * SEC EDGAR adapter against RECORDED response shapes (frames, ticker map,
 * submissions — verified live 2026-09-30). CI never calls SEC.
 */

const NOW = new Date("2026-09-30T23:00:00Z");

const tickers = {
  "0": { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP" },
  "1": { cik_str: 1652044, ticker: "GOOGL", title: "Alphabet Inc." },
  "2": { cik_str: 1652044, ticker: "GOOG", title: "Alphabet Inc." },
  "3": { cik_str: 70858, ticker: "BAC", title: "BANK OF AMERICA CORP /DE/" },
  "4": { cik_str: 70858, ticker: "BAC-PL", title: "BANK OF AMERICA CORP /DE/" },
  "5": { cik_str: 1000697, ticker: "WAT", title: "WATERS CORP /DE/" },
  "6": { cik_str: 1067983, ticker: "BRK-B", title: "BERKSHIRE HATHAWAY INC" },
  "7": { cik_str: 1067983, ticker: "BRK-A", title: "BERKSHIRE HATHAWAY INC" },
  "8": { cik_str: 1403161, ticker: "V", title: "VISA INC." },
};

const frames: Record<
  string,
  Array<{ cik: number; entityName: string; end: string; val: number }>
> = {
  // cover-page counts (instant)
  "dei/EntityCommonStockSharesOutstanding/shares/CY2026Q3I": [
    { cik: 1045810, entityName: "NVIDIA CORP", end: "2026-08-20", val: 24_300_000_000 },
  ],
  "dei/EntityCommonStockSharesOutstanding/shares/CY2026Q2I": [
    { cik: 1045810, entityName: "NVIDIA CORP", end: "2026-05-20", val: 24_400_000_000 },
    { cik: 70858, entityName: "BANK OF AMERICA", end: "2026-07-31", val: 7_400_000_000 },
    { cik: 1000697, entityName: "Waters Corporation", end: "2026-08-07", val: 98_248_111 },
    { cik: 1652044, entityName: "Alphabet Inc.", end: "2026-07-20", val: 5_800_000_000 }, // one class
    // a stale filer: ignored
    { cik: 1067983, entityName: "BERKSHIRE HATHAWAY INC", end: "2011-04-29", val: 941_481 },
  ],
  // weighted-average basic (quarter)
  "us-gaap/WeightedAverageNumberOfSharesOutstandingBasic/shares/CY2026Q2": [
    { cik: 1652044, entityName: "Alphabet Inc.", end: "2026-06-30", val: 12_151_000_000 },
    // mis-scaled ×1,000 — the cover count must win for a single-class filer
    { cik: 1000697, entityName: "Waters Corporation", end: "2026-07-04", val: 98_204_000_000 },
  ],
  "dei/EntityPublicFloat/USD/CY2025Q2I": [
    { cik: 1403161, entityName: "VISA INC.", end: "2025-03-31", val: 601_100_000_000 },
  ],
};

function recordedFetch(seen: Array<{ url: string; ua: string | null }> = []): SecFetch {
  return async (url, init) => {
    seen.push({ url, ua: new Headers(init.headers).get("User-Agent") });
    const u = new URL(url);
    if (u.pathname === "/files/company_tickers.json") return Response.json(tickers);
    const frame = /\/api\/xbrl\/frames\/(.+)\.json$/.exec(u.pathname)?.[1];
    if (frame)
      return frames[frame]
        ? Response.json({ data: frames[frame] })
        : new Response("", { status: 404 });
    if (u.pathname === "/submissions/CIK0001045810.json") return Response.json({ sic: "3674" });
    if (
      u.pathname === "/api/xbrl/companyconcept/CIK0001045810/us-gaap/EarningsPerShareDiluted.json"
    ) {
      return Response.json({
        units: {
          "USD/shares": [
            { start: "2025-01-27", end: "2026-01-25", val: 4.9, form: "10-K" },
            // the same period restated in a later filing — one fact survives
            { start: "2025-01-27", end: "2026-01-25", val: 4.9, form: "10-K" },
            { start: "2026-01-26", end: "2026-07-26", val: 4.85, form: "10-Q" },
            { end: "2026-07-26", val: 1 }, // instant-shaped noise: no start → ignored
          ],
        },
      });
    }
    if (
      u.pathname === "/api/xbrl/companyconcept/CIK0000000007/us-gaap/EarningsPerShareBasic.json"
    ) {
      return Response.json({
        units: { "USD/shares": [{ start: "2025-01-01", end: "2025-12-31", val: -0.42 }] },
      });
    }
    return new Response("", { status: 404 });
  };
}

const sec = (fetchFn: SecFetch) =>
  new SecEdgarShares("Arthosrot test test@example.com", fetchFn, async () => {});

describe("SEC EDGAR share counts (recorded responses)", () => {
  it("prefers the newest cover count for a single-class filer", async () => {
    const counts = await sec(recordedFetch()).listShareCounts(NOW);
    const nvda = counts.find((c) => c.cik === "1045810")!;
    expect(nvda).toMatchObject({ tickers: ["NVDA"], basis: "cover", asOf: "2026-08-20" });
    expect(nvda.shares?.toString()).toBe("24300000000");
  });

  it("uses the weighted average (all classes) for a multi-class filer", async () => {
    const counts = await sec(recordedFetch()).listShareCounts(NOW);
    const goog = counts.find((c) => c.cik === "1652044")!;
    expect(goog.tickers).toEqual(["GOOGL", "GOOG"]);
    expect(goog).toMatchObject({ basis: "weighted-average" });
    expect(goog.shares?.toString()).toBe("12151000000");
  });

  it("trusts the cover count over a mis-scaled weighted average", async () => {
    const counts = await sec(recordedFetch()).listShareCounts(NOW);
    expect(counts.find((c) => c.cik === "1000697")?.shares?.toString()).toBe("98248111");
  });

  it("keeps class tickers in our form and drops preferreds", async () => {
    const counts = await sec(recordedFetch()).listShareCounts(NOW);
    expect(counts.find((c) => c.cik === "70858")?.tickers).toEqual(["BAC"]);
  });

  it("drops stale counts; reports a filer with only a public float as unvalued", async () => {
    const counts = await sec(recordedFetch()).listShareCounts(NOW);
    expect(counts.find((c) => c.cik === "1067983")).toBeUndefined();
    const visa = counts.find((c) => c.cik === "1403161")!;
    expect(visa.shares).toBeNull();
    expect(visa.publicFloat?.toString()).toBe("601100000000.00");
  });

  it("sends the fair-access User-Agent on every request; tolerates unfiled frames", async () => {
    const seen: Array<{ url: string; ua: string | null }> = [];
    await sec(recordedFetch(seen)).listShareCounts(NOW);
    expect(seen.length).toBeGreaterThan(5);
    expect(seen.every((r) => r.ua === "Arthosrot test test@example.com")).toBe(true);
  });

  it("looks up SIC codes once per filer", async () => {
    const seen: Array<{ url: string; ua: string | null }> = [];
    const source = sec(recordedFetch(seen));
    expect(await source.industryCode("1045810")).toBe("3674");
    expect(await source.industryCode("1045810")).toBe("3674");
    expect(seen.filter((r) => r.url.includes("/submissions/"))).toHaveLength(1);
  });

  it("reads diluted EPS history, one fact per period, as 4dp strings", async () => {
    const facts = await sec(recordedFetch()).epsHistory("1045810");
    expect(facts).toEqual([
      { start: "2025-01-27", end: "2026-01-25", value: "4.9000" },
      { start: "2026-01-26", end: "2026-07-26", value: "4.8500" },
    ]);
  });

  it("falls back to basic EPS, and to null when a filer reports none", async () => {
    expect(await sec(recordedFetch()).epsHistory("7")).toEqual([
      { start: "2025-01-01", end: "2025-12-31", value: "-0.4200" },
    ]);
    expect(await sec(recordedFetch()).epsHistory("8")).toBeNull();
  });

  it("maps SEC errors to ProviderUnavailableError", async () => {
    const down = sec(async () => new Response("", { status: 403 }));
    await expect(down.listShareCounts(NOW)).rejects.toThrow(ProviderUnavailableError);
  });
});

describe("recentQuarters", () => {
  it("walks back across year boundaries", () => {
    expect(recentQuarters(new Date("2026-02-10T00:00:00Z"), 3)).toEqual([
      "CY2026Q1",
      "CY2025Q4",
      "CY2025Q3",
    ]);
  });
});
