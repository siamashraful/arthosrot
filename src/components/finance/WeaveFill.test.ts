import { describe, expect, it } from "vitest";
import { laidPicks } from "./WeaveFill";

/** Honesty at the extremes: a real partial never renders empty or complete. */
describe("laidPicks", () => {
  it("renders resting and filled exactly", () => {
    expect(laidPicks(0, 25)).toBe(0);
    expect(laidPicks(25, 25)).toBe(10);
    expect(laidPicks(30, 25)).toBe(10); // defensive over-fill clamp
  });

  it("never rounds a partial to the extremes", () => {
    expect(laidPicks(24, 25)).toBe(9); // round(9.6) would claim FILLED
    expect(laidPicks(1, 25)).toBe(1); // round(0.4) would claim untouched
    expect(laidPicks(1, 1000)).toBe(1);
    expect(laidPicks(999, 1000)).toBe(9);
  });

  it("tracks proportion in the middle", () => {
    expect(laidPicks(5, 10)).toBe(5);
    expect(laidPicks(1, 4)).toBe(3); // round(2.5) — same value the mount settles at
  });
});
