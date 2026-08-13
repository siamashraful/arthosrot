import type { MarketStatus, Quote } from "./types";

/**
 * Display freshness vs execution eligibility are DIFFERENT concerns (ADR-007):
 * display freshness drives UI chips/warnings; execution eligibility belongs to
 * the venue in deployed mode. Only the DeterministicPaperBroker (its own
 * execution authority) enforces strict staleness.
 */

export type DisplayFreshness = "live" | "aging" | "stale" | "at-close";

export const DISPLAY_AGING_MS = 30_000;
export const DISPLAY_STALE_MS = 120_000;
/** Deterministic-broker execution staleness threshold. */
export const EXECUTION_MAX_QUOTE_AGE_MS = 10_000;

export function quoteAgeMs(quote: Quote, now: Date): number {
  return Math.max(0, now.getTime() - quote.ts.getTime());
}

export function displayFreshness(quote: Quote, now: Date, status: MarketStatus): DisplayFreshness {
  if (status === "CLOSED") return "at-close";
  const age = quoteAgeMs(quote, now);
  if (age <= DISPLAY_AGING_MS) return "live";
  if (age <= DISPLAY_STALE_MS) return "aging";
  return "stale";
}

export function isFreshEnoughForExecution(
  quote: Quote,
  now: Date,
  maxAgeMs: number = EXECUTION_MAX_QUOTE_AGE_MS,
): boolean {
  return quoteAgeMs(quote, now) <= maxAgeMs;
}

/**
 * US regular-session calendar approximation: weekdays 09:30–16:00 ET with
 * DST handled via Intl. Exchange holidays are NOT modeled — a documented
 * limitation (docs/LIMITATIONS.md): on a holiday this may report OPEN while
 * the venue rejects/queues orders, which the venue-authority model absorbs.
 */
export function marketStatusAt(now: Date): MarketStatus {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  if (weekday === "Sat" || weekday === "Sun") return "CLOSED";
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return "PRE";
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return "OPEN";
  if (minutes >= 16 * 60 && minutes < 20 * 60) return "POST";
  return "CLOSED";
}
