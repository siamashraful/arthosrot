import { describe, expect, it } from "vitest";
import { ApiError, type QuoteDto } from "./api";
import {
  checkLimitPrice,
  checkQty,
  estimateNotional,
  placeOrderError,
  referencePrice,
  sanitizePriceInput,
  sanitizeQtyInput,
  ticketPrecheck,
} from "./order-ticket";

const quote: QuoteDto = {
  symbol: "AAPL",
  bid: "199.9000",
  bidSize: 100,
  ask: "200.1000",
  askSize: 100,
  last: "200.0000",
  ts: "2026-10-01T14:00:00Z",
  source: "fixture",
  previousClose: null,
  dayChange: null,
};

const apiError = (status: number, code: string, subcode?: string, message = "server says") =>
  new ApiError(status, { code, subcode, message, requestId: "r" });

describe("ticket inputs", () => {
  it("keeps digits only in the quantity field", () => {
    expect(sanitizeQtyInput("1,2a3.5")).toBe("1235");
  });

  it("keeps one decimal point and at most 4 decimals in the price field", () => {
    expect(sanitizePriceInput("$1,50.1.2")).toBe("150.12");
    expect(sanitizePriceInput("150.123456")).toBe("150.1234");
  });

  it("quantity: empty is quiet, zero and over-cap explain themselves", () => {
    expect(checkQty("")).toEqual({ ok: false, error: null });
    expect(checkQty("0")).toEqual({ ok: false, error: "Enter at least 1 share." });
    expect(checkQty("1000001")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/1,000,000/),
    });
    expect(checkQty("1000000")).toEqual({ ok: true, value: 1_000_000 });
    expect(checkQty("007")).toEqual({ ok: true, value: 7 });
  });

  it("limit price: zero is rejected (the server would 500 on it), mid-typing is quiet", () => {
    expect(checkLimitPrice("0")).toEqual({ ok: false, error: "Limit price must be more than $0." });
    expect(checkLimitPrice("0.0000")).toMatchObject({ ok: false, error: expect.any(String) });
    expect(checkLimitPrice("150.")).toEqual({ ok: false, error: null });
    expect(checkLimitPrice("")).toEqual({ ok: false, error: null });
    expect(checkLimitPrice("0150.5")).toEqual({ ok: true, value: "150.5" });
    expect(checkLimitPrice(".25")).toEqual({ ok: true, value: "0.25" });
  });
});

describe("estimateNotional", () => {
  it("multiplies exactly, without float drift", () => {
    expect(estimateNotional("200.1", 10)).toBe("2001.00");
    // 0.1 + 0.2 style traps: 19.99 × 3 = 59.97 exactly
    expect(estimateNotional("19.99", 3)).toBe("59.97");
  });

  it("rounds once to the cent, half to even", () => {
    expect(estimateNotional("0.0050", 1)).toBe("0.00"); // 0.5¢ → even (0)
    expect(estimateNotional("0.0150", 1)).toBe("0.02"); // 1.5¢ → even (2)
    expect(estimateNotional("0.0151", 1)).toBe("0.02");
    expect(estimateNotional("1.2345", 1)).toBe("1.23");
  });
});

describe("referencePrice", () => {
  it("uses the ask for buys, the bid for sells, last when a side is missing", () => {
    expect(referencePrice(quote, "BUY")).toBe("200.1000");
    expect(referencePrice(quote, "SELL")).toBe("199.9000");
    expect(referencePrice({ ...quote, ask: null }, "BUY")).toBe("200.0000");
    expect(referencePrice(null, "BUY")).toBeNull();
  });
});

describe("ticketPrecheck", () => {
  const base = { symbol: "AAPL", buyingPower: "10000.00", sellable: "0" };

  it("catches selling shares you don't hold", () => {
    expect(ticketPrecheck({ ...base, side: "SELL", qty: 1, estimate: "199.90" })).toBe(
      "You don't hold any AAPL to sell.",
    );
  });

  it("caps a sell at the sellable quantity", () => {
    expect(ticketPrecheck({ ...base, sellable: "3", side: "SELL", qty: 4, estimate: null })).toBe(
      "You can sell up to 3 shares.",
    );
    expect(ticketPrecheck({ ...base, sellable: "1", side: "SELL", qty: 2, estimate: null })).toBe(
      "You can sell up to 1 share.",
    );
    expect(
      ticketPrecheck({ ...base, sellable: "3", side: "SELL", qty: 3, estimate: null }),
    ).toBeNull();
  });

  it("compares a buy estimate to buying power to the cent", () => {
    expect(ticketPrecheck({ ...base, side: "BUY", qty: 1, estimate: "10000.00" })).toBeNull();
    expect(ticketPrecheck({ ...base, side: "BUY", qty: 1, estimate: "10000.01" })).toMatch(
      /more than your buying power \(\$10,000\.00\)/,
    );
    expect(ticketPrecheck({ ...base, side: "BUY", qty: 1, estimate: null })).toBeNull();
  });
});

describe("placeOrderError", () => {
  it("a network failure is uncertain: confirm again with the same key", () => {
    expect(placeOrderError(new TypeError("fetch failed"))).toMatchObject({ retryable: true });
  });

  it("a server error is uncertain too", () => {
    expect(placeOrderError(apiError(500, "INTERNAL"))).toMatchObject({
      retryable: true,
      message: expect.stringMatching(/won't be placed twice/),
    });
  });

  it("maps domain refusals to plain copy that needs an edit", () => {
    expect(
      placeOrderError(apiError(422, "DOMAIN_RULE", "INSUFFICIENT_BUYING_POWER")),
    ).toMatchObject({ retryable: false, message: expect.stringMatching(/buffer above the ask/) });
    expect(placeOrderError(apiError(422, "VALIDATION", "INSTRUMENT_INACTIVE"))).toMatchObject({
      retryable: false,
    });
  });

  it("falls back to the server's message for other 4xx", () => {
    expect(placeOrderError(apiError(400, "VALIDATION", undefined, "Invalid request"))).toEqual({
      message: "Invalid request",
      retryable: false,
    });
  });
});
