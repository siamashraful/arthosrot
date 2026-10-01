import { describe, expect, it } from "vitest";
import {
  alertNotification,
  alertTitle,
  checkAlertPrice,
  comparePrices,
  formatAlertPrice,
  formatAlertTime,
  sanitizePriceInput,
  toPriceUnits,
} from "./alerts";
import type { PriceAlertDto } from "./api";

const base: PriceAlertDto = {
  id: "a1",
  symbol: "AAPL",
  direction: "ABOVE",
  threshold: "210.0000",
  state: "ACTIVE",
  createdAt: "2026-10-01T14:00:00Z",
  triggeredAt: null,
  triggerPrice: null,
  triggerQuoteAt: null,
  readAt: null,
};

describe("price units: exact, never float", () => {
  it("scales to ten-thousandths", () => {
    expect(toPriceUnits("210")).toBe(2_100_000n);
    expect(toPriceUnits("0.0001")).toBe(1n);
    expect(toPriceUnits("210.5")).toBe(2_105_000n);
  });

  it("compares exactly", () => {
    expect(comparePrices("0.3", "0.3000")).toBe(0);
    expect(comparePrices("210.0001", "210")).toBe(1);
    expect(comparePrices("99.9999", "100")).toBe(-1);
  });
});

describe("sanitizePriceInput", () => {
  it.each([
    ["$1,234.50", "1234.50"],
    ["210.123456", "210.1234"],
    ["2.1.0", "2.10"],
    ["abc", ""],
    [" 210 ", "210"],
  ])("%s → %s", (raw, out) => expect(sanitizePriceInput(raw)).toBe(out));
});

describe("formatAlertPrice", () => {
  it.each([
    ["210.0000", "$210.00"],
    ["210.5000", "$210.50"],
    ["210.1250", "$210.125"],
    ["0.1234", "$0.1234"],
    ["12345.6", "$12,345.60"],
  ])("%s → %s", (v, out) => expect(formatAlertPrice(v)).toBe(out));
});

describe("checkAlertPrice", () => {
  const ctx = { direction: "ABOVE" as const, symbol: "AAPL", last: "200.0000" };

  it("is quiet while empty or mid-typing", () => {
    expect(checkAlertPrice("", ctx)).toEqual({ ok: false, error: null });
    expect(checkAlertPrice("210.", ctx)).toEqual({ ok: false, error: null });
  });

  it("accepts a valid price on the right side of the current price", () => {
    expect(checkAlertPrice("210", ctx)).toEqual({ ok: true, price: "210" });
    expect(checkAlertPrice("190.25", { ...ctx, direction: "BELOW" })).toEqual({
      ok: true,
      price: "190.25",
    });
  });

  it("refuses zero and malformed prices", () => {
    expect(checkAlertPrice("0.00", ctx)).toMatchObject({ ok: false, error: expect.any(String) });
    expect(checkAlertPrice("12345678901", ctx)).toMatchObject({ ok: false });
  });

  it("refuses a threshold the current price already meets (inclusive)", () => {
    const above = checkAlertPrice("200", ctx);
    expect(above).toEqual({
      ok: false,
      error: "AAPL is at $200.00 now. Pick a price above it.",
    });
    const below = checkAlertPrice("200.0000", { ...ctx, direction: "BELOW" });
    expect(below).toEqual({ ok: false, error: "AAPL is at $200.00 now. Pick a price below it." });
  });

  it("skips the side check without a quote", () => {
    expect(checkAlertPrice("1", { ...ctx, last: null })).toEqual({ ok: true, price: "1" });
  });

  it("never uses an em dash in user-facing copy", () => {
    const messages = [
      checkAlertPrice("0", ctx),
      checkAlertPrice("200", ctx),
      checkAlertPrice("12345678901", ctx),
    ].map((r) => (r.ok ? "" : (r.error ?? "")));
    for (const m of messages) expect(m).not.toContain("—");
  });
});

describe("alert words", () => {
  it("titles active and triggered alerts", () => {
    expect(alertTitle(base)).toBe("AAPL above $210.00");
    expect(alertTitle({ ...base, direction: "BELOW", threshold: "190.5000" })).toBe(
      "AAPL below $190.50",
    );
    expect(alertTitle({ ...base, state: "TRIGGERED" })).toBe("AAPL crossed above $210.00");
  });

  it("formats the trigger time in market time", () => {
    const now = Date.parse("2026-10-01T18:00:00Z");
    expect(formatAlertTime("2026-10-01T14:42:00Z", now)).toBe("10:42 AM ET");
    expect(formatAlertTime("2026-09-30T14:42:00Z", now)).toBe("Sep 30, 10:42 AM ET");
  });

  it("builds the notification line from the triggering quote's time", () => {
    const now = Date.parse("2026-10-01T18:00:00Z");
    const triggered: PriceAlertDto = {
      ...base,
      state: "TRIGGERED",
      triggeredAt: "2026-10-01T14:45:00Z",
      triggerPrice: "210.3500",
      triggerQuoteAt: "2026-10-01T14:42:00Z",
    };
    expect(alertNotification(triggered, now)).toBe("AAPL crossed above $210.00 · 10:42 AM ET");
  });
});
