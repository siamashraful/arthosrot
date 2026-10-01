import { describe, expect, it } from "vitest";
import { Px } from "../money";
import { fiftyTwoWeekRange, priceToEarnings, trailingEps, type EpsFact } from "./fundamentals";

const NOW = new Date("2026-09-30T20:00:00Z");
const fact = (start: string, end: string, value: string): EpsFact => ({ start, end, value });

describe("trailingEps", () => {
  // NVIDIA's diluted EPS as filed (fiscal year ends late January)
  const nvda = [
    fact("2025-01-27", "2025-07-27", "1.8400"), // H1 FY26
    fact("2025-04-28", "2025-07-27", "1.0800"),
    fact("2025-01-27", "2025-10-26", "3.1400"),
    fact("2025-01-27", "2026-01-25", "4.9000"), // FY26
    fact("2026-01-26", "2026-04-26", "2.3900"),
    fact("2026-01-26", "2026-07-26", "4.8500"), // H1 FY27
    fact("2026-04-27", "2026-07-26", "2.4600"),
  ];

  it("is last fiscal year + this YTD − last year's YTD (= the last four quarters)", () => {
    expect(trailingEps(nvda, NOW)).toEqual({
      eps: "7.9100",
      basis: "ttm",
      periodEnd: "2026-07-26",
    });
  });

  it("falls back to the fiscal year when the matching prior YTD is missing", () => {
    const partial = nvda.filter((f) => f.end !== "2025-07-27");
    expect(trailingEps(partial, NOW)).toEqual({
      eps: "4.9000",
      basis: "fy",
      periodEnd: "2026-01-25",
    });
  });

  it("handles losses exactly", () => {
    const loss = [
      fact("2025-01-01", "2025-12-31", "-1.2000"),
      fact("2026-01-01", "2026-06-30", "-0.3000"),
      fact("2025-01-01", "2025-06-30", "-0.9000"),
    ];
    expect(trailingEps(loss, NOW)?.eps).toBe("-0.6000");
  });

  it("is null when the last annual report is too old", () => {
    expect(trailingEps([fact("2023-01-01", "2023-12-31", "2.0000")], NOW)).toBeNull();
  });
});

describe("priceToEarnings", () => {
  it("divides exactly and rounds half-even to one decimal", () => {
    expect(priceToEarnings(Px.fromString("185.0000"), "7.9100")).toBe("23.4");
    expect(priceToEarnings(Px.fromString("10.2500"), "1.0000")).toBe("10.2"); // 10.25 → 10.2
    expect(priceToEarnings(Px.fromString("10.3500"), "1.0000")).toBe("10.4");
  });

  it("is null for zero or negative earnings", () => {
    expect(priceToEarnings(Px.fromString("50"), "0.0000")).toBeNull();
    expect(priceToEarnings(Px.fromString("50"), "-0.6000")).toBeNull();
  });
});

describe("fiftyTwoWeekRange", () => {
  const bar = (time: string, high: string, low: string) => ({
    time,
    open: low,
    high,
    low,
    close: high,
    volume: 1,
  });

  it("spans the last 365 days only, widened by the live price", () => {
    const candles = [
      bar("2025-06-01T04:00:00Z", "999.0000", "1.0000"), // older than a year
      bar("2025-12-01T05:00:00Z", "120.0000", "90.0000"),
      bar("2026-06-01T04:00:00Z", "150.0000", "110.0000"),
    ];
    const r = fiftyTwoWeekRange(candles, NOW, Px.fromString("155.0000"))!;
    expect([r.high.toString(), r.low.toString()]).toEqual(["155.0000", "90.0000"]);
  });

  it("is null without bars", () => {
    expect(fiftyTwoWeekRange([], NOW, null)).toBeNull();
  });
});
