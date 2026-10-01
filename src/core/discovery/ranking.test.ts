import { describe, expect, it } from "vitest";
import { Money, Px, Qty } from "../money";
import { SECTORS, TOP100_SEED } from "./catalog";
import {
  isDepositaryReceipt,
  rankByMarketCap,
  validateSnapshot,
  type ShareCount,
  type ShareOverride,
} from "./ranking";

const count = (
  cik: string,
  tickers: string[],
  shares: string | null,
  publicFloat: string | null = null,
): ShareCount => ({
  cik,
  name: `Co ${cik}`,
  tickers,
  shares: shares ? Qty.of(shares) : null,
  asOf: "2026-06-30",
  basis: shares ? "cover" : "none",
  publicFloat: publicFloat ? Money.fromString(publicFloat) : null,
});

const prices = (entries: Record<string, string>) =>
  new Map(Object.entries(entries).map(([s, p]) => [s, Px.fromString(p)]));

const noSic = async () => "3571";

describe("rankByMarketCap", () => {
  it("ranks by shares × price, exactly, largest first", async () => {
    const { ranked } = await rankByMarketCap({
      shareCounts: [count("1", ["AAA"], "1000"), count("2", ["BBB"], "10")],
      eligible: new Set(["AAA", "BBB"]),
      prices: prices({ AAA: "1.5000", BBB: "200.0000" }),
      overrides: [],
      industryCode: noSic,
    });
    expect(ranked.map((r) => [r.rank, r.symbol, r.marketCap.toString()])).toEqual([
      [1, "BBB", "2000.00"],
      [2, "AAA", "1500.00"],
    ]);
  });

  it("values a multi-class filer once, on its first priced eligible class", async () => {
    const { ranked } = await rankByMarketCap({
      shareCounts: [count("1", ["GOOGL", "GOOG"], "100")],
      eligible: new Set(["GOOG", "GOOGL"]),
      prices: prices({ GOOGL: "10", GOOG: "10.1" }),
      overrides: [],
      industryCode: noSic,
    });
    expect(ranked.map((r) => r.symbol)).toEqual(["GOOGL"]);
  });

  it("skips symbols outside the catalog or without a price", async () => {
    const { ranked } = await rankByMarketCap({
      shareCounts: [count("1", ["NOPE"], "100"), count("2", ["NOPX"], "100")],
      eligible: new Set(["NOPX"]),
      prices: prices({ NOPE: "1" }),
      overrides: [],
      industryCode: noSic,
    });
    expect(ranked).toEqual([]);
  });

  it("drops investment trusts by SIC (commodity trusts file 10-Qs too)", async () => {
    const { ranked } = await rankByMarketCap({
      shareCounts: [count("1", ["GLD"], "1000"), count("2", ["AAA"], "1")],
      eligible: new Set(["GLD", "AAA"]),
      prices: prices({ GLD: "300", AAA: "1" }),
      overrides: [],
      industryCode: async (cik) => (cik === "1" ? "6221" : "3571"),
    });
    expect(ranked.map((r) => r.symbol)).toEqual(["AAA"]);
  });

  it("rejects a value its own public float contradicts (mis-scaled filing)", async () => {
    const result = await rankByMarketCap({
      // 1,000× too many shares: $1T computed vs a $2B float
      shareCounts: [
        count("1", ["BAD"], "100000000000", "2000000000"),
        count("2", ["OK"], "10", "5"),
      ],
      eligible: new Set(["BAD", "OK"]),
      prices: prices({ BAD: "10", OK: "1" }),
      overrides: [],
      industryCode: noSic,
    });
    expect(result.ranked.map((r) => r.symbol)).toEqual(["OK"]);
    expect(result.rejected.map((r) => r.symbol)).toEqual(["BAD"]);
  });

  it("overrides supply missing counts, add omitted filers, and exclude", async () => {
    const overrides: ShareOverride[] = [
      {
        cik: "9",
        name: "Berk",
        displaySymbol: "BRK.B",
        shares: "100",
        asOf: "2026-07-29",
        note: "",
      },
      { cik: "3", name: "Bad", exclude: true, asOf: "2026-09-30", note: "" },
    ];
    const result = await rankByMarketCap({
      shareCounts: [count("3", ["RPAY"], "999999"), count("4", ["V"], null, "600000000000")],
      eligible: new Set(["BRK.B", "RPAY", "V"]),
      prices: prices({ "BRK.B": "500", RPAY: "4", V: "350" }),
      overrides,
      industryCode: noSic,
    });
    expect(result.ranked.map((r) => r.symbol)).toEqual(["BRK.B"]);
    // a large filer we couldn't value is reported, not silently dropped
    expect(result.missing.map((m) => m.cik)).toEqual(["4"]);
  });

  it("stops at the requested size", async () => {
    const shareCounts = Array.from({ length: 5 }, (_, i) => count(String(i), [`S${i}`], "1"));
    const { ranked } = await rankByMarketCap({
      shareCounts,
      eligible: new Set(shareCounts.flatMap((s) => s.tickers)),
      prices: prices(Object.fromEntries(shareCounts.map((s, i) => [s.tickers[0]!, `${i + 1}`]))),
      overrides: [],
      industryCode: noSic,
      size: 3,
    });
    expect(ranked.map((r) => r.symbol)).toEqual(["S4", "S3", "S2"]);
  });
});

describe("validateSnapshot", () => {
  const list = (n: number, prefix = "S") =>
    Array.from({ length: n }, (_, i) => ({ symbol: `${prefix}${i}` }));
  const coverage = { candidates: 100, priced: 95 };

  it("accepts a full, consistent list", () => {
    expect(validateSnapshot(list(100), list(100), coverage)).toEqual({ ok: true });
    expect(validateSnapshot(null, list(100), coverage)).toEqual({ ok: true });
  });

  it("refuses a short list", () => {
    expect(validateSnapshot(null, list(99), coverage).ok).toBe(false);
  });

  it("refuses when too few candidates were priced", () => {
    expect(validateSnapshot(null, list(100), { candidates: 100, priced: 70 }).ok).toBe(false);
  });

  it("refuses a top 10 that changed wholesale", () => {
    expect(validateSnapshot(list(100, "A"), list(100, "B"), coverage).ok).toBe(false);
  });
});

describe("isDepositaryReceipt", () => {
  it.each([
    ["Akari Therapeutics plc ADS", true],
    ["BeOne Medicines Ltd. American Depositary Shares", true],
    ["Some Co ADR", true],
    ["Apple Inc. Common Stock", false],
    ["ADSK Autodesk", false],
  ])("%s → %s", (name, expected) => {
    expect(isDepositaryReceipt(name)).toBe(expected);
  });
});

describe("browse catalog", () => {
  const symbolRe = /^[A-Za-z.\-]+$/;

  it("has unique slugs and well-formed, non-repeating symbols", () => {
    expect(new Set(SECTORS.map((s) => s.slug)).size).toBe(SECTORS.length);
    for (const sector of SECTORS) {
      const symbols = sector.companies.map((c) => c.symbol);
      expect(new Set(symbols).size, sector.slug).toBe(symbols.length);
      for (const s of symbols) expect(s).toMatch(symbolRe);
    }
  });

  it("seeds exactly 100 unique ranked companies", () => {
    const symbols = TOP100_SEED.entries.map((e) => e.symbol);
    expect(symbols).toHaveLength(100);
    expect(new Set(symbols).size).toBe(100);
    expect(TOP100_SEED.entries.map((e) => e.rank)).toEqual(
      Array.from({ length: 100 }, (_, i) => i + 1),
    );
  });
});
