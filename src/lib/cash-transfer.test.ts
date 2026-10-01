import { describe, expect, it } from "vitest";
import {
  addMoney,
  centsToString,
  checkTransferAmount,
  parseAmount,
  percentOf,
  sanitizeAmountInput,
  subtractMoney,
  toCents,
  transferErrorMessage,
  type TransferRules,
} from "./cash-transfer";

const rules = (over: Partial<TransferRules> = {}): TransferRules => ({
  direction: "DEPOSIT",
  minAmount: "1.00",
  maxPerTransfer: "50000.00",
  depositRemainingToday: "50000.00",
  withdrawable: "10000.00",
  ...over,
});

describe("exact cents", () => {
  it("round-trips canonical strings without float drift", () => {
    expect(toCents("1234.56")).toBe(123456n);
    expect(toCents("0.1")).toBe(10n);
    expect(toCents("-0.05")).toBe(-5n);
    expect(centsToString(5n)).toBe("0.05");
    expect(centsToString(-123456n)).toBe("-1234.56");
    expect(addMoney("0.10", "0.20")).toBe("0.30");
    expect(subtractMoney("10000.00", "1500.01")).toBe("8499.99");
  });

  it("takes a percentage rounded down to the cent", () => {
    expect(percentOf("8500.00", 25)).toBe("2125.00");
    expect(percentOf("0.03", 50)).toBe("0.01");
    expect(percentOf("100.01", 50)).toBe("50.00");
    expect(percentOf("0.00", 50)).toBe("0.00");
  });
});

describe("amount input", () => {
  it("strips commas and symbols and keeps at most 2 decimals", () => {
    expect(sanitizeAmountInput("$1,000")).toBe("1000");
    expect(sanitizeAmountInput("12.345")).toBe("12.34");
    expect(sanitizeAmountInput("1.2.3")).toBe("1.23");
    expect(sanitizeAmountInput("abc")).toBe("");
  });

  it("parses only complete dollar amounts", () => {
    expect(parseAmount("500")).toBe("500.00");
    expect(parseAmount("500.5")).toBe("500.50");
    expect(parseAmount("1,000.25")).toBe("1000.25");
    expect(parseAmount("500.")).toBeNull();
    expect(parseAmount(".5")).toBeNull();
    expect(parseAmount("1.234")).toBeNull();
  });
});

describe("checkTransferAmount", () => {
  it("is quiet on an empty field", () => {
    expect(checkTransferAmount("", rules())).toEqual({ ok: false, error: null });
  });

  it("enforces min and per-transfer max exactly at the boundary", () => {
    expect(checkTransferAmount("0.99", rules())).toMatchObject({ ok: false });
    expect(checkTransferAmount("1", rules())).toEqual({ ok: true, amount: "1.00" });
    expect(checkTransferAmount("50000", rules())).toEqual({ ok: true, amount: "50000.00" });
    expect(checkTransferAmount("50000.01", rules())).toMatchObject({ ok: false });
  });

  it("caps deposits at today's remaining allowance", () => {
    const r = rules({ depositRemainingToday: "1200.00" });
    expect(checkTransferAmount("1200", r)).toEqual({ ok: true, amount: "1200.00" });
    expect(checkTransferAmount("1200.01", r)).toEqual({
      ok: false,
      error: "You can add up to $1,200.00 more today.",
    });
  });

  it("caps withdrawals at the withdrawable amount", () => {
    const r = rules({ direction: "WITHDRAWAL", withdrawable: "8500.00" });
    expect(checkTransferAmount("8500", r)).toEqual({ ok: true, amount: "8500.00" });
    expect(checkTransferAmount("8500.01", r)).toEqual({
      ok: false,
      error: "You can withdraw up to $8,500.00.",
    });
    expect(
      checkTransferAmount("5", rules({ direction: "WITHDRAWAL", withdrawable: "0.00" })),
    ).toEqual({ ok: false, error: "There's no cash available to withdraw right now." });
  });

  it("rejects malformed amounts", () => {
    expect(checkTransferAmount("12.", rules())).toMatchObject({ ok: false });
  });
});

describe("transferErrorMessage", () => {
  it("maps conflicts, subcodes and unknown errors", () => {
    expect(transferErrorMessage({ status: 409, code: "IDEMPOTENCY_CONFLICT" })).toMatch(
      /Start over/,
    );
    expect(transferErrorMessage({ status: 422, subcode: "INSUFFICIENT_WITHDRAWABLE" })).toMatch(
      /available-to-withdraw/,
    );
    expect(transferErrorMessage({ status: 500 })).toMatch(/try again/i);
  });
});
