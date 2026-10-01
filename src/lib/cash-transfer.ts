/**
 * Cash-transfer amount handling for the paper deposit / withdraw sheet.
 * Presentation-side pre-checks only — the server re-validates every rule in
 * decimal and stays the authority. Amounts are handled EXACTLY as integer
 * cents (BigInt) on canonical "1234.56" strings: never parseFloat, never JS
 * number arithmetic on money (FINANCIAL_INVARIANTS.md).
 */

import { formatMoney } from "./format";

export type TransferDirection = "DEPOSIT" | "WITHDRAWAL";

/** Canonical money string ("1234.56", "-0.50") → integer cents. Extra dp truncate. */
export function toCents(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole = "0", frac = ""] = (negative ? value.slice(1) : value).split(".");
  const cents = BigInt(whole || "0") * 100n + BigInt(frac.padEnd(2, "0").slice(0, 2) || "0");
  return negative ? -cents : cents;
}

/** Integer cents → canonical 2dp string ("1234.56"). */
export function centsToString(cents: bigint): string {
  const negative = cents < 0n;
  const abs = (negative ? -cents : cents).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${abs.slice(0, -2)}.${abs.slice(-2)}`;
}

/** a + b on canonical money strings, exact. */
export function addMoney(a: string, b: string): string {
  return centsToString(toCents(a) + toCents(b));
}

/** a − b on canonical money strings, exact. */
export function subtractMoney(a: string, b: string): string {
  return centsToString(toCents(a) - toCents(b));
}

/** `percent`% of a money string, rounded DOWN to the cent (never exceeds the base). */
export function percentOf(value: string, percent: number): string {
  const cents = toCents(value);
  if (cents <= 0n) return "0.00";
  return centsToString((cents * BigInt(percent)) / 100n);
}

/**
 * What the user typed → the field's text: commas, "$" and spaces stripped,
 * only digits and one decimal point, at most 2 decimals kept.
 */
export function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/[,$\s]/g, "").replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const whole = cleaned.slice(0, dot);
  const frac = cleaned
    .slice(dot + 1)
    .replace(/\./g, "")
    .slice(0, 2);
  return `${whole}.${frac}`;
}

/** A complete dollar amount ("500", "500.5", "500.25") → canonical "500.25", else null. */
export function parseAmount(input: string): string | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.replace(/,/g, "").trim());
  if (!m) return null;
  return centsToString(BigInt(m[1]!) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0"));
}

export interface TransferRules {
  direction: TransferDirection;
  minAmount: string;
  maxPerTransfer: string;
  depositRemainingToday: string;
  withdrawable: string;
}

export type AmountCheck =
  | { ok: true; amount: string }
  /** `error` is null for an empty field: nothing to complain about yet. */
  | { ok: false; error: string | null };

/** Mirrors the server's transfer rules so a doomed request is caught before review. */
export function checkTransferAmount(input: string, rules: TransferRules): AmountCheck {
  if (input.trim() === "") return { ok: false, error: null };
  const amount = parseAmount(input);
  if (amount === null) return { ok: false, error: AMOUNT_FORMAT_MESSAGE };
  const cents = toCents(amount);
  if (cents < toCents(rules.minAmount)) {
    return { ok: false, error: `The minimum transfer is ${formatMoney(rules.minAmount)}.` };
  }
  if (cents > toCents(rules.maxPerTransfer)) {
    return {
      ok: false,
      error: `The most you can move in one transfer is ${formatMoney(rules.maxPerTransfer)}.`,
    };
  }
  if (rules.direction === "DEPOSIT" && cents > toCents(rules.depositRemainingToday)) {
    return {
      ok: false,
      error:
        toCents(rules.depositRemainingToday) <= 0n
          ? "You've reached today's deposit limit. Try again tomorrow."
          : `You can add up to ${formatMoney(rules.depositRemainingToday)} more today.`,
    };
  }
  if (rules.direction === "WITHDRAWAL" && cents > toCents(rules.withdrawable)) {
    return {
      ok: false,
      error:
        toCents(rules.withdrawable) <= 0n
          ? "There's no cash available to withdraw right now."
          : `You can withdraw up to ${formatMoney(rules.withdrawable)}.`,
    };
  }
  return { ok: true, amount };
}

export const AMOUNT_FORMAT_MESSAGE = "Enter a dollar amount, like 500 or 500.25.";

/** A failed submission → copy the user can act on. */
export function transferErrorMessage(err: {
  status: number;
  code?: string;
  subcode?: string;
}): string {
  if (err.status === 409) {
    return "This request was already submitted with different details. Start over.";
  }
  switch (err.subcode) {
    case "AMOUNT_TOO_SMALL":
      return "That amount is below the minimum transfer. Go back and enter a larger amount.";
    case "AMOUNT_TOO_LARGE":
      return "That amount is over the per-transfer limit. Go back and enter a smaller amount.";
    case "DEPOSIT_LIMIT":
      return "That would go over today's deposit limit. Go back and enter a smaller amount.";
    case "INSUFFICIENT_WITHDRAWABLE":
      return "Your available-to-withdraw balance changed and is now below this amount. Go back and enter a smaller amount.";
    case "ACCOUNT_NOT_ACTIVE":
      return "Your account isn't ready for transfers yet. Try again once it's open.";
  }
  if (err.code === "VALIDATION") return AMOUNT_FORMAT_MESSAGE;
  return "The transfer couldn't be completed. Check your connection and try again.";
}
