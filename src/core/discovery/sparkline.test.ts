import { describe, expect, it } from "vitest";
import { downsampleSeries, SPARKLINE_MAX_POINTS } from "./sparkline";

describe("downsampleSeries", () => {
  it("passes short series through unchanged (a copy)", () => {
    const input = ["1.0000", "2.0000", "3.0000"];
    const out = downsampleSeries(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it("thins a full 5-minute session (78 bars) to at most 40 points", () => {
    const input = Array.from({ length: 78 }, (_, i) => `${100 + i}.0000`);
    const out = downsampleSeries(input);
    expect(out).toHaveLength(SPARKLINE_MAX_POINTS);
    expect(out[0]).toBe("100.0000");
    expect(out.at(-1)).toBe("177.0000"); // always ends at the latest close
  });

  it("keeps the original order and only original values", () => {
    const input = Array.from({ length: 100 }, (_, i) => String(i));
    const out = downsampleSeries(input, 10);
    expect(out).toHaveLength(10);
    expect(out.every((v) => input.includes(v))).toBe(true);
    const asIdx = out.map(Number);
    expect([...asIdx].sort((a, b) => a - b)).toEqual(asIdx);
    expect(new Set(out).size).toBe(10);
  });

  it("handles empty and boundary sizes", () => {
    expect(downsampleSeries([])).toEqual([]);
    expect(downsampleSeries(["1"])).toEqual(["1"]);
    expect(downsampleSeries(["1", "2", "3"], 2)).toEqual(["1", "3"]);
    expect(() => downsampleSeries(["1"], 1)).toThrow();
  });
});
