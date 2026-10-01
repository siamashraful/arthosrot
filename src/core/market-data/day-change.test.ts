import { describe, expect, it } from "vitest";
import { Px } from "../money";
import { dayChange } from "./day-change";
import type { Quote } from "./types";

const quote = (last: string, previousClose: string | null): Quote => ({
  symbol: "AAPL",
  bid: null,
  bidSize: null,
  ask: null,
  askSize: null,
  last: Px.fromString(last),
  ts: new Date("2026-09-30T20:00:00Z"),
  source: "fixture",
  previousClose: previousClose ? Px.fromString(previousClose) : null,
});

describe("dayChange", () => {
  it("measures last against the previous close", () => {
    const d = dayChange(quote("333.0500", "329.5800"))!;
    expect(d.absolute.toString()).toBe("3.47");
    expect(d.percent).toBe("1.05");
  });

  it("is null without a reference close", () => {
    expect(dayChange(quote("333.0500", null))).toBeNull();
  });
});
