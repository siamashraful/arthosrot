import { Money } from "../money";
import { AppError } from "../shared";

/**
 * Pure rules for paper cash transfers (ADR-015, FINANCIAL_INVARIANTS.md
 * 16–20). No I/O: the service calls these inside the account lock.
 */

export type CashTransferDirection = "DEPOSIT" | "WITHDRAWAL";
export type CashTransferState = "PENDING" | "SETTLED" | "FAILED" | "CANCELED";

export interface TransferLimits {
  /** Smallest accepted transfer (inclusive). */
  minAmount: Money;
  /** Largest single transfer (inclusive). */
  maxPerTransfer: Money;
  /**
   * Cap on money deposited into one account in any trailing window
   * (PENDING + SETTLED deposits, plus the opening deposit when the account
   * was opened inside the window). Mirrors the Alpaca sandbox's
   * $50,000/account/day transfer cap (INTEGRATIONS.md).
   */
  dailyDepositCap: Money;
  /** The trailing window the cap applies to. */
  depositWindowMs: number;
}

export const DEFAULT_TRANSFER_LIMITS: TransferLimits = {
  minAmount: Money.fromString("1.00"),
  maxPerTransfer: Money.fromString("50000.00"),
  dailyDepositCap: Money.fromString("50000.00"),
  depositWindowMs: 24 * 60 * 60_000,
};

/** Positive decimal with at most 2 dp; integer part bounded so NUMERIC(18,2) always fits. */
const AMOUNT_RE = /^\d{1,16}(\.\d{1,2})?$/;

/**
 * Parse a client-supplied amount string. Malformed (non-numeric, > 2dp,
 * signed, exponent, empty) or non-positive amounts are VALIDATION errors —
 * never coerced (no parseFloat on money).
 */
export function parseTransferAmount(raw: unknown): Money {
  if (typeof raw !== "string" || !AMOUNT_RE.test(raw)) {
    throw new AppError("VALIDATION", "Enter an amount in dollars and cents, e.g. 500.00", {
      subcode: "INVALID_AMOUNT",
    });
  }
  const amount = Money.fromString(raw);
  if (amount.isZero()) {
    throw new AppError("VALIDATION", "Amount must be greater than zero", {
      subcode: "INVALID_AMOUNT",
    });
  }
  return amount;
}

/**
 * withdrawable = cash − open BUY reservations − PENDING withdrawal holds,
 * floored at 0.00. "Only the cash not actively being used."
 */
export function computeWithdrawable(
  cash: Money,
  reservedForOrders: Money,
  pendingWithdrawals: Money,
): Money {
  const free = cash.subtract(reservedForOrders).subtract(pendingWithdrawals);
  return free.isNegative() ? Money.zero() : free;
}

/** Remaining deposit headroom inside the trailing window, floored at 0.00. */
export function depositRemaining(limits: TransferLimits, depositedInWindow: Money): Money {
  const left = limits.dailyDepositCap.subtract(depositedInWindow);
  return left.isNegative() ? Money.zero() : left;
}

/**
 * The request-time rule check. Throws DOMAIN_RULE with the contract
 * subcodes; returns normally when the transfer may be created.
 */
export function checkTransferRequest(input: {
  direction: CashTransferDirection;
  amount: Money;
  limits: TransferLimits;
  /** Only consulted for withdrawals. */
  withdrawable: Money;
  /** Only consulted for deposits: PENDING+SETTLED deposits in the window. */
  depositedInWindow: Money;
}): void {
  const { direction, amount, limits } = input;
  if (amount.lt(limits.minAmount)) {
    throw new AppError("DOMAIN_RULE", `The minimum transfer is $${limits.minAmount.toString()}`, {
      subcode: "AMOUNT_TOO_SMALL",
    });
  }
  if (amount.compare(limits.maxPerTransfer) > 0) {
    throw new AppError(
      "DOMAIN_RULE",
      `The maximum per transfer is $${limits.maxPerTransfer.toString()}`,
      { subcode: "AMOUNT_TOO_LARGE" },
    );
  }
  if (direction === "DEPOSIT") {
    const remaining = depositRemaining(limits, input.depositedInWindow);
    if (amount.compare(remaining) > 0) {
      throw new AppError(
        "DOMAIN_RULE",
        `Deposits are limited to $${limits.dailyDepositCap.toString()} per 24 hours: $${remaining.toString()} remaining`,
        { subcode: "DEPOSIT_LIMIT" },
      );
    }
  } else if (amount.compare(input.withdrawable) > 0) {
    throw new AppError(
      "DOMAIN_RULE",
      `You can withdraw up to $${input.withdrawable.toString()} (cash not held for open orders or pending withdrawals)`,
      { subcode: "INSUFFICIENT_WITHDRAWABLE" },
    );
  }
}

/** Canonical request fingerprint — same key + same fingerprint = safe replay. */
export function requestFingerprint(direction: CashTransferDirection, amount: Money): string {
  return `${direction}:${amount.toString()}`;
}

/**
 * Transfer state machine: PENDING is the only non-terminal state; terminal
 * states have no exits (a settled transfer can never post twice, a failed
 * one can never settle later).
 */
export function canTransition(from: CashTransferState, to: CashTransferState): boolean {
  return from === "PENDING" && to !== "PENDING";
}

export function isTerminalTransferState(state: CashTransferState): boolean {
  return state !== "PENDING";
}
