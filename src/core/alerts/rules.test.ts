import { describe, expect, it } from "vitest";
import type { Quote } from "../market-data";
import { Px } from "../money";
import { AppError } from "../shared";
import {
  ALERT_MAX_QUOTE_AGE_MS,
  canTransitionAlert,
  checkActiveAlertLimit,
  conditionHolds,
  evaluateAlert,
  MAX_ACTIVE_ALERTS_PER_USER,
  parseAlertThreshold,
  type AlertDirection,
  type AlertState,
} from "./rules";

const NOW = new Date("2026-10-01T14:42:00Z"); // 10:42 ET, a Thursday

function quote(last: string, ageMs = 0): Quote {
  return {
    symbol: "AAPL",
    bid: null,
    bidSize: null,
    ask: null,
    askSize: null,
    last: Px.fromString(last),
    ts: new Date(NOW.getTime() - ageMs),
    source: "fixture",
    previousClose: null,
  };
}

function alert(direction: AlertDirection, threshold: string, state: AlertState = "ACTIVE") {
  return { state, direction, threshold: Px.fromString(threshold) };
}

const open = { now: NOW, marketStatus: "OPEN" as const };

function rejectionOf(fn: () => unknown): AppError {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("expected a rejection");
}

describe("parseAlertThreshold", () => {
  it.each(["210", "210.5", "210.00", "0.0001", "1234567890.1234"])("accepts %s", (raw) => {
    expect(parseAlertThreshold(raw).toString()).toBe(Px.fromString(raw).toString());
  });

  it.each([
    ["number", 210],
    ["empty", ""],
    ["5dp", "210.00001"],
    ["signed", "-5"],
    ["plus sign", "+5"],
    ["exponent", "1e3"],
    ["comma", "1,000"],
    ["11 integer digits", "12345678901"],
    ["trailing dot", "210."],
    ["whitespace", " 210"],
  ])("rejects %s as VALIDATION/INVALID_ALERT_PRICE", (_label, raw) => {
    const err = rejectionOf(() => parseAlertThreshold(raw));
    expect(err.code).toBe("VALIDATION");
    expect(err.subcode).toBe("INVALID_ALERT_PRICE");
  });

  it.each(["0", "0.0000", "000.00"])("rejects zero (%s)", (raw) => {
    const err = rejectionOf(() => parseAlertThreshold(raw));
    expect(err.subcode).toBe("INVALID_ALERT_PRICE");
    expect(err.message).toMatch(/greater than zero/);
  });
});

describe("checkActiveAlertLimit", () => {
  it("allows up to the cap and refuses one more", () => {
    expect(() => checkActiveAlertLimit(MAX_ACTIVE_ALERTS_PER_USER - 1)).not.toThrow();
    const err = rejectionOf(() => checkActiveAlertLimit(MAX_ACTIVE_ALERTS_PER_USER));
    expect(err.code).toBe("DOMAIN_RULE");
    expect(err.subcode).toBe("ALERT_LIMIT_REACHED");
  });
});

describe("alert state machine", () => {
  it("ACTIVE triggers or cancels; TRIGGERED only cancels; CANCELED is terminal", () => {
    expect(canTransitionAlert("ACTIVE", "TRIGGERED")).toBe(true);
    expect(canTransitionAlert("ACTIVE", "CANCELED")).toBe(true);
    expect(canTransitionAlert("TRIGGERED", "CANCELED")).toBe(true);
    expect(canTransitionAlert("TRIGGERED", "ACTIVE")).toBe(false); // re-arm = a new alert
    expect(canTransitionAlert("CANCELED", "ACTIVE")).toBe(false);
    expect(canTransitionAlert("CANCELED", "TRIGGERED")).toBe(false);
    expect(canTransitionAlert("ACTIVE", "ACTIVE")).toBe(false);
  });
});

describe("conditionHolds: exact, inclusive at the threshold", () => {
  it("ABOVE holds at and over the threshold", () => {
    const t = Px.fromString("210.00");
    expect(conditionHolds("ABOVE", t, Px.fromString("210.0000"))).toBe(true);
    expect(conditionHolds("ABOVE", t, Px.fromString("210.0001"))).toBe(true);
    expect(conditionHolds("ABOVE", t, Px.fromString("209.9999"))).toBe(false);
  });

  it("BELOW holds at and under the threshold", () => {
    const t = Px.fromString("150.5");
    expect(conditionHolds("BELOW", t, Px.fromString("150.5000"))).toBe(true);
    expect(conditionHolds("BELOW", t, Px.fromString("150.4999"))).toBe(true);
    expect(conditionHolds("BELOW", t, Px.fromString("150.5001"))).toBe(false);
  });

  it("does not suffer float error (0.1 + 0.2 style thresholds)", () => {
    expect(conditionHolds("ABOVE", Px.fromString("0.3"), Px.fromString("0.3000"))).toBe(true);
    expect(conditionHolds("BELOW", Px.fromString("0.3"), Px.fromString("0.3000"))).toBe(true);
  });
});

describe("evaluateAlert", () => {
  it("triggers at exactly the threshold with the observed price and quote time", () => {
    const q = quote("210.0000", 5_000);
    const v = evaluateAlert(alert("ABOVE", "210.00"), q, open);
    expect(v).toEqual({ kind: "TRIGGER", price: q.last, quoteAt: q.ts });
  });

  it("holds when the condition is not met", () => {
    expect(evaluateAlert(alert("ABOVE", "210"), quote("209.99"), open)).toEqual({
      kind: "HOLD",
      reason: "CONDITION_NOT_MET",
    });
    expect(evaluateAlert(alert("BELOW", "210"), quote("210.01"), open)).toEqual({
      kind: "HOLD",
      reason: "CONDITION_NOT_MET",
    });
  });

  it("never triggers on a stale quote, even when the price is beyond the threshold", () => {
    const stale = quote("250.00", ALERT_MAX_QUOTE_AGE_MS + 1);
    expect(evaluateAlert(alert("ABOVE", "210"), stale, open)).toEqual({
      kind: "HOLD",
      reason: "STALE_QUOTE",
    });
    // exactly at the limit is still fresh
    const edge = quote("250.00", ALERT_MAX_QUOTE_AGE_MS);
    expect(evaluateAlert(alert("ABOVE", "210"), edge, open).kind).toBe("TRIGGER");
  });

  it("respects a configured max age", () => {
    const q = quote("250.00", 61_000);
    expect(evaluateAlert(alert("ABOVE", "210"), q, { ...open, maxQuoteAgeMs: 60_000 })).toEqual({
      kind: "HOLD",
      reason: "STALE_QUOTE",
    });
  });

  it.each(["CLOSED", "PRE", "POST"] as const)(
    "never triggers outside the regular session (%s)",
    (status) => {
      expect(
        evaluateAlert(alert("ABOVE", "210"), quote("250.00"), {
          now: NOW,
          marketStatus: status,
        }),
      ).toEqual({ kind: "HOLD", reason: "MARKET_NOT_OPEN" });
    },
  );

  it("gap rule: a market that opens beyond the threshold triggers at the first fresh quote, at the observed price", () => {
    const a = alert("ABOVE", "210.00");
    // Overnight: the at-close price is shown, never acted on.
    expect(
      evaluateAlert(a, quote("205.00", 17 * 3_600_000), { now: NOW, marketStatus: "CLOSED" }).kind,
    ).toBe("HOLD");
    // At the open the last quote is still yesterday's close: stale → hold.
    expect(evaluateAlert(a, quote("205.00", 17 * 3_600_000), open)).toEqual({
      kind: "HOLD",
      reason: "STALE_QUOTE",
    });
    // First fresh in-session quote gapped to 215: trigger at 215, not 210.
    const first = quote("215.00", 2_000);
    const v = evaluateAlert(a, first, open);
    expect(v.kind).toBe("TRIGGER");
    if (v.kind === "TRIGGER") expect(v.price.toString()).toBe("215.0000");

    // Same for a gap down through a BELOW alert.
    const down = evaluateAlert(alert("BELOW", "190"), quote("181.25", 1_000), open);
    expect(down.kind === "TRIGGER" && down.price.toString()).toBe("181.2500");
  });

  it("holds without a quote (delisted / unknown to the feed)", () => {
    expect(evaluateAlert(alert("ABOVE", "1"), null, open)).toEqual({
      kind: "HOLD",
      reason: "NO_QUOTE",
    });
  });

  it.each(["TRIGGERED", "CANCELED"] as const)("never re-evaluates a %s alert", (state) => {
    expect(evaluateAlert(alert("ABOVE", "1", state), quote("500"), open)).toEqual({
      kind: "HOLD",
      reason: "NOT_ACTIVE",
    });
  });

  it("treats a future-dated quote (clock skew) as fresh", () => {
    const q = quote("220", -30_000);
    expect(evaluateAlert(alert("ABOVE", "210"), q, open).kind).toBe("TRIGGER");
  });
});
