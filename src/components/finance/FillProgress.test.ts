import { describe, expect, it } from "vitest";
import { fillPercent } from "./FillProgress";

describe("fillPercent", () => {
  it("maps resting, partial and filled to 0–100", () => {
    expect(fillPercent(0, 10)).toBe(0);
    expect(fillPercent(5, 10)).toBe(50);
    expect(fillPercent(10, 10)).toBe(100);
  });

  it("clamps an over-fill to 100", () => {
    expect(fillPercent(12, 10)).toBe(100);
  });

  it("renders empty for a zero quantity instead of NaN", () => {
    expect(fillPercent(0, 0)).toBe(0);
    expect(fillPercent(3, 0)).toBe(0);
  });

  it("rounds to an integer", () => {
    expect(fillPercent(1, 3)).toBe(33);
    expect(fillPercent(2, 3)).toBe(67);
  });
});
