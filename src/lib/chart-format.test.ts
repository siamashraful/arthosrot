import { describe, expect, it } from "vitest";
import { formatScrubTime, priceChange } from "./chart-format";

describe("priceChange", () => {
  it("is exact on decimal strings (no float drift)", () => {
    expect(priceChange("0.1000", "0.3000")).toEqual({
      absolute: "0.20",
      percent: "200.00",
      direction: 1,
    });
    expect(priceChange("250.1000", "253.3000")).toEqual({
      absolute: "3.20",
      percent: "1.28",
      direction: 1,
    });
  });

  it("signs losses and rounds half-even", () => {
    expect(priceChange("100.0000", "99.5500")).toEqual({
      absolute: "-0.45",
      percent: "-0.45",
      direction: -1,
    });
    // 0.005 → 0.00 (half to even), 0.015 → 0.02
    expect(priceChange("10.0000", "10.0050").absolute).toBe("0.00");
    expect(priceChange("10.0000", "10.0150").absolute).toBe("0.02");
  });

  it("reports flat without a negative zero", () => {
    expect(priceChange("10.0000", "9.9960")).toEqual({
      absolute: "0.00",
      percent: "-0.04",
      direction: 0,
    });
  });

  it("has no percent off a zero base", () => {
    expect(priceChange("0", "5.0000").percent).toBeNull();
  });
});

describe("formatScrubTime", () => {
  const iso = "2026-09-29T18:35:00Z"; // Tue 2:35 PM ET

  it("labels intraday bars with day and market time", () => {
    expect(formatScrubTime(iso, "1D")).toBe("Tue, Sep 29 · 2:35 PM ET");
    expect(formatScrubTime(iso, "1W")).toBe("Tue, Sep 29 · 2:35 PM ET");
  });

  it("labels daily bars with the date and weekly bars with the week", () => {
    expect(formatScrubTime(iso, "1M")).toBe("Tue, Sep 29, 2026");
    expect(formatScrubTime(iso, "1Y")).toBe("Tue, Sep 29, 2026");
    expect(formatScrubTime(iso, "5Y")).toBe("Week of Sep 29, 2026");
  });
});
