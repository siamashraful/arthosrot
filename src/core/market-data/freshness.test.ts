import { describe, expect, it } from "vitest";
import { Px } from "../money";
import {
  displayFreshness,
  isFreshEnoughForExecution,
  marketStatusAt,
  quoteAgeMs,
} from "./freshness";
import type { Quote } from "./types";

function quoteAt(ts: Date): Quote {
  return {
    symbol: "AAPL",
    bid: null,
    bidSize: null,
    ask: null,
    askSize: null,
    last: Px.fromString("200"),
    ts,
    source: "fixture",
  };
}

describe("marketStatusAt (ET calendar approximation)", () => {
  it("labels a regular Tuesday session correctly across DST", () => {
    // 2026-01-06 (EST, UTC-5): 15:00 UTC = 10:00 ET -> OPEN
    expect(marketStatusAt(new Date("2026-01-06T15:00:00Z"))).toBe("OPEN");
    // 2026-07-07 (EDT, UTC-4): 15:00 UTC = 11:00 ET -> OPEN
    expect(marketStatusAt(new Date("2026-07-07T15:00:00Z"))).toBe("OPEN");
    // 2026-01-06 14:29 UTC = 09:29 ET -> PRE
    expect(marketStatusAt(new Date("2026-01-06T14:29:00Z"))).toBe("PRE");
    // 2026-01-06 21:00 UTC = 16:00 ET -> POST
    expect(marketStatusAt(new Date("2026-01-06T21:00:00Z"))).toBe("POST");
    // 2026-01-06 02:00 UTC = 21:00 ET previous day -> CLOSED
    expect(marketStatusAt(new Date("2026-01-07T02:30:00Z"))).toBe("CLOSED");
  });

  it("weekends are CLOSED", () => {
    expect(marketStatusAt(new Date("2026-01-10T15:00:00Z"))).toBe("CLOSED"); // Saturday
    expect(marketStatusAt(new Date("2026-01-11T15:00:00Z"))).toBe("CLOSED"); // Sunday
  });
});

describe("display freshness vs execution eligibility (ADR-007 split)", () => {
  const now = new Date("2026-01-06T15:00:00Z");

  it("classifies display freshness by age", () => {
    expect(displayFreshness(quoteAt(new Date(now.getTime() - 5_000)), now, "OPEN")).toBe("live");
    expect(displayFreshness(quoteAt(new Date(now.getTime() - 60_000)), now, "OPEN")).toBe("aging");
    expect(displayFreshness(quoteAt(new Date(now.getTime() - 300_000)), now, "OPEN")).toBe("stale");
    expect(displayFreshness(quoteAt(now), now, "CLOSED")).toBe("at-close");
  });

  it("execution eligibility uses its own, stricter threshold", () => {
    const eleven = quoteAt(new Date(now.getTime() - 11_000));
    // Display still calls an 11s-old quote "live"…
    expect(displayFreshness(eleven, now, "OPEN")).toBe("live");
    // …but the deterministic broker already refuses to execute against it.
    expect(isFreshEnoughForExecution(eleven, now)).toBe(false);
    expect(isFreshEnoughForExecution(quoteAt(new Date(now.getTime() - 9_000)), now)).toBe(true);
  });

  it("clock skew never yields negative ages", () => {
    expect(quoteAgeMs(quoteAt(new Date(now.getTime() + 5_000)), now)).toBe(0);
  });
});
