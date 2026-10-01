import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Money } from "../money";
import {
  canTransition,
  checkTransferRequest,
  computeWithdrawable,
  DEFAULT_TRANSFER_LIMITS,
  depositRemaining,
  isTerminalTransferState,
  parseTransferAmount,
  requestFingerprint,
  type CashTransferState,
} from "./rules";

/** Paper cash-transfer rules (ADR-015; FINANCIAL_INVARIANTS.md 16–20). */

const m = (s: string) => Money.fromString(s);

function check(
  direction: "DEPOSIT" | "WITHDRAWAL",
  amount: string,
  opts: { withdrawable?: string; deposited?: string } = {},
) {
  return () =>
    checkTransferRequest({
      direction,
      amount: m(amount),
      limits: DEFAULT_TRANSFER_LIMITS,
      withdrawable: m(opts.withdrawable ?? "0.00"),
      depositedInWindow: m(opts.deposited ?? "0.00"),
    });
}

describe("parseTransferAmount", () => {
  it("accepts positive decimals with at most 2dp", () => {
    expect(parseTransferAmount("500.00").toString()).toBe("500.00");
    expect(parseTransferAmount("500").toString()).toBe("500.00");
    expect(parseTransferAmount("0.5").toString()).toBe("0.50");
    expect(parseTransferAmount("50000.00").toString()).toBe("50000.00");
  });

  it.each([
    "",
    "abc",
    "1.234",
    "-5.00",
    "+5.00",
    "1e3",
    "5,000.00",
    " 5.00",
    ".50",
    "5.",
    "NaN",
    "Infinity",
    "0",
    "0.00",
    "12345678901234567.00",
  ])("rejects %j as VALIDATION/INVALID_AMOUNT", (raw) => {
    expect(() => parseTransferAmount(raw)).toThrow(
      expect.objectContaining({ code: "VALIDATION", subcode: "INVALID_AMOUNT" }),
    );
  });

  it("rejects non-strings (numbers are never coerced into money)", () => {
    for (const raw of [500, 5.5, null, undefined, {}, ["5.00"]]) {
      expect(() => parseTransferAmount(raw)).toThrow(
        expect.objectContaining({ code: "VALIDATION", subcode: "INVALID_AMOUNT" }),
      );
    }
  });
});

describe("computeWithdrawable", () => {
  it("is cash − open BUY reservations − pending withdrawals", () => {
    // the contract example: 8000 cash, 1025 reserved -> 6975
    expect(computeWithdrawable(m("8000.00"), m("1025.00"), m("0.00")).toString()).toBe("6975.00");
    expect(computeWithdrawable(m("8000.00"), m("1025.00"), m("975.00")).toString()).toBe("6000.00");
  });

  it("floors at 0.00 (never negative, even when a fill overran its reservation)", () => {
    expect(computeWithdrawable(m("100.00"), m("150.00"), m("0.00")).toString()).toBe("0.00");
    expect(computeWithdrawable(m("-20.00"), m("0.00"), m("0.00")).toString()).toBe("0.00");
  });

  it("property: holds + reservations + withdrawable never exceed cash when cash ≥ commitments", () => {
    const cents = fc.integer({ min: 0, max: 10_000_000 });
    fc.assert(
      fc.property(cents, cents, cents, (c, r, p) => {
        const toM = (n: number) =>
          Money.fromString(`${Math.trunc(n / 100)}.${String(n % 100).padStart(2, "0")}`);
        const cash = toM(c);
        const w = computeWithdrawable(cash, toM(r), toM(p));
        expect(w.isNegative()).toBe(false);
        if (c >= r + p) {
          expect(w.add(toM(r)).add(toM(p)).equals(cash)).toBe(true);
        } else {
          expect(w.isZero()).toBe(true);
        }
      }),
    );
  });
});

describe("checkTransferRequest", () => {
  it("enforces the minimum (inclusive 1.00)", () => {
    expect(check("DEPOSIT", "0.99")).toThrow(
      expect.objectContaining({ code: "DOMAIN_RULE", subcode: "AMOUNT_TOO_SMALL" }),
    );
    expect(check("WITHDRAWAL", "0.01", { withdrawable: "100.00" })).toThrow(
      expect.objectContaining({ subcode: "AMOUNT_TOO_SMALL" }),
    );
    expect(check("DEPOSIT", "1.00")).not.toThrow();
  });

  it("enforces the per-transfer maximum (inclusive 50000.00)", () => {
    expect(check("DEPOSIT", "50000.01")).toThrow(
      expect.objectContaining({ code: "DOMAIN_RULE", subcode: "AMOUNT_TOO_LARGE" }),
    );
    expect(check("WITHDRAWAL", "50000.01", { withdrawable: "99999.00" })).toThrow(
      expect.objectContaining({ subcode: "AMOUNT_TOO_LARGE" }),
    );
    expect(check("DEPOSIT", "50000.00")).not.toThrow();
  });

  it("caps deposits in the trailing window, pending included", () => {
    expect(check("DEPOSIT", "100.00", { deposited: "49900.00" })).not.toThrow();
    expect(check("DEPOSIT", "100.01", { deposited: "49900.00" })).toThrow(
      expect.objectContaining({ code: "DOMAIN_RULE", subcode: "DEPOSIT_LIMIT" }),
    );
    expect(check("DEPOSIT", "1.00", { deposited: "50000.00" })).toThrow(
      expect.objectContaining({ subcode: "DEPOSIT_LIMIT" }),
    );
  });

  it("withdrawals may not exceed withdrawable; deposits ignore it", () => {
    expect(check("WITHDRAWAL", "6975.00", { withdrawable: "6975.00" })).not.toThrow();
    expect(check("WITHDRAWAL", "6975.01", { withdrawable: "6975.00" })).toThrow(
      expect.objectContaining({ code: "DOMAIN_RULE", subcode: "INSUFFICIENT_WITHDRAWABLE" }),
    );
    expect(check("DEPOSIT", "500.00", { withdrawable: "0.00" })).not.toThrow();
    // withdrawals are not limited by the deposit cap
    expect(
      check("WITHDRAWAL", "10.00", { withdrawable: "10.00", deposited: "50000.00" }),
    ).not.toThrow();
  });

  it("checks the size limits before the balance rules", () => {
    expect(check("WITHDRAWAL", "0.50", { withdrawable: "0.00" })).toThrow(
      expect.objectContaining({ subcode: "AMOUNT_TOO_SMALL" }),
    );
  });
});

describe("depositRemaining", () => {
  it("is the cap minus what was deposited, floored at zero", () => {
    expect(depositRemaining(DEFAULT_TRANSFER_LIMITS, m("0.00")).toString()).toBe("50000.00");
    expect(depositRemaining(DEFAULT_TRANSFER_LIMITS, m("10000.00")).toString()).toBe("40000.00");
    expect(depositRemaining(DEFAULT_TRANSFER_LIMITS, m("60000.00")).toString()).toBe("0.00");
  });
});

describe("transfer state machine", () => {
  const states: CashTransferState[] = ["PENDING", "SETTLED", "FAILED", "CANCELED"];

  it("PENDING is the only state with exits, and it cannot loop to itself", () => {
    for (const from of states) {
      for (const to of states) {
        expect(canTransition(from, to)).toBe(from === "PENDING" && to !== "PENDING");
      }
    }
  });

  it("terminal states are SETTLED, FAILED, CANCELED", () => {
    expect(states.filter(isTerminalTransferState)).toEqual(["SETTLED", "FAILED", "CANCELED"]);
  });
});

describe("requestFingerprint", () => {
  it("is canonical in the amount (500 and 500.00 are the same request)", () => {
    expect(requestFingerprint("DEPOSIT", parseTransferAmount("500"))).toBe(
      requestFingerprint("DEPOSIT", parseTransferAmount("500.00")),
    );
    expect(requestFingerprint("DEPOSIT", m("500.00"))).not.toBe(
      requestFingerprint("WITHDRAWAL", m("500.00")),
    );
    expect(requestFingerprint("DEPOSIT", m("500.00"))).not.toBe(
      requestFingerprint("DEPOSIT", m("500.01")),
    );
  });
});
