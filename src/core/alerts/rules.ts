import { quoteAgeMs, type MarketStatus, type Quote } from "../market-data";
import { Px } from "../money";
import { AppError } from "../shared";

/**
 * Pure rules for price alerts (ADR-016). No I/O: validation of a client
 * threshold, the one-shot state machine, and the trigger evaluation the job
 * and the opportunistic read both call. Alerts are NOTIFICATIONS about display
 * data — nothing here ever feeds execution, reservations or the ledger.
 */

export type AlertDirection = "ABOVE" | "BELOW";
export type AlertState = "ACTIVE" | "TRIGGERED" | "CANCELED";

/** Cap on ACTIVE alerts per user (TRIGGERED / CANCELED don't count). */
export const MAX_ACTIVE_ALERTS_PER_USER = 50;

/**
 * Never trigger on a quote observed longer ago than this. A cached quote that
 * outlived a provider outage carries its own (old) timestamp, so it fails
 * this check instead of firing an alert on a price that is no longer true.
 */
export const ALERT_MAX_QUOTE_AGE_MS = 15 * 60_000;

/** Positive decimal, ≤ 4dp (Px precision), ≤ 10 integer digits so it fits NUMERIC(18,4). */
const THRESHOLD_RE = /^\d{1,10}(\.\d{1,4})?$/;

/**
 * Parse a client-supplied threshold string into a Px. Malformed (non-string,
 * signed, exponent, > 4dp, empty) or zero thresholds are VALIDATION errors —
 * never coerced (no parseFloat on prices).
 */
export function parseAlertThreshold(raw: unknown): Px {
  if (typeof raw !== "string" || !THRESHOLD_RE.test(raw)) {
    throw new AppError("VALIDATION", "Enter a price with at most 4 decimal places, e.g. 210.00", {
      subcode: "INVALID_ALERT_PRICE",
    });
  }
  if (!/[1-9]/.test(raw)) {
    throw new AppError("VALIDATION", "Price must be greater than zero", {
      subcode: "INVALID_ALERT_PRICE",
    });
  }
  return Px.fromString(raw);
}

/** Throws DOMAIN_RULE ALERT_LIMIT_REACHED when one more ACTIVE alert would exceed the cap. */
export function checkActiveAlertLimit(activeCount: number, max = MAX_ACTIVE_ALERTS_PER_USER): void {
  if (activeCount >= max) {
    throw new AppError(
      "DOMAIN_RULE",
      `You can have up to ${max} active alerts. Delete one to add another.`,
      { subcode: "ALERT_LIMIT_REACHED" },
    );
  }
}

/**
 * One-shot lifecycle. ACTIVE is the only state that is evaluated. TRIGGERED
 * keeps its trigger facts forever (the user may still delete it from the
 * list); CANCELED is the soft delete and terminal. "Re-arm" is a NEW alert
 * with the same terms — a triggered alert never goes back to ACTIVE, so its
 * trigger price/time stay immutable history.
 */
const TRANSITIONS: Record<AlertState, readonly AlertState[]> = {
  ACTIVE: ["TRIGGERED", "CANCELED"],
  TRIGGERED: ["CANCELED"],
  CANCELED: [],
};

export function canTransitionAlert(from: AlertState, to: AlertState): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * The condition, inclusive at the threshold, exact decimal compare:
 * ABOVE holds when last ≥ threshold, BELOW when last ≤ threshold.
 */
export function conditionHolds(direction: AlertDirection, threshold: Px, last: Px): boolean {
  const cmp = last.compare(threshold);
  return direction === "ABOVE" ? cmp >= 0 : cmp <= 0;
}

export type AlertHoldReason =
  "NOT_ACTIVE" | "MARKET_NOT_OPEN" | "NO_QUOTE" | "STALE_QUOTE" | "CONDITION_NOT_MET";

export type AlertEvaluation =
  { kind: "TRIGGER"; price: Px; quoteAt: Date } | { kind: "HOLD"; reason: AlertHoldReason };

/**
 * Should this alert trigger on this quote, now?
 *
 * - Only during the regular session (`marketStatus === "OPEN"`): pre/post and
 *   closed-market quotes never trigger. Off-hours prices (at-close) are shown,
 *   not acted on.
 * - Only on a fresh quote (observed ≤ `maxQuoteAgeMs` ago).
 * - Gap rule: if the market opens beyond the threshold, the FIRST fresh
 *   in-session quote triggers it, and the recorded trigger price is that
 *   quote's last — the price actually observed, not the threshold.
 */
export function evaluateAlert(
  alert: { state: AlertState; direction: AlertDirection; threshold: Px },
  quote: Quote | null,
  ctx: { now: Date; marketStatus: MarketStatus; maxQuoteAgeMs?: number },
): AlertEvaluation {
  if (alert.state !== "ACTIVE") return { kind: "HOLD", reason: "NOT_ACTIVE" };
  if (ctx.marketStatus !== "OPEN") return { kind: "HOLD", reason: "MARKET_NOT_OPEN" };
  if (!quote) return { kind: "HOLD", reason: "NO_QUOTE" };
  const maxAge = ctx.maxQuoteAgeMs ?? ALERT_MAX_QUOTE_AGE_MS;
  if (quoteAgeMs(quote, ctx.now) > maxAge) {
    return { kind: "HOLD", reason: "STALE_QUOTE" };
  }
  if (!conditionHolds(alert.direction, alert.threshold, quote.last)) {
    return { kind: "HOLD", reason: "CONDITION_NOT_MET" };
  }
  return { kind: "TRIGGER", price: quote.last, quoteAt: quote.ts };
}
