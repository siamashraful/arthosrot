/**
 * Price-alert presentation helpers (ADR-016): price-field sanitizing and
 * pre-checks for the alert sheet, the words and times an alert row shows,
 * error copy, and the shared query definitions. Presentation only: the
 * server re-validates everything and is the only thing that evaluates
 * alerts. Prices are handled EXACTLY as integer ten-thousandths (BigInt) on
 * canonical decimal strings: never parseFloat, never JS number arithmetic.
 */

import { queryOptions } from "@tanstack/react-query";
import { api, ApiError, type AlertDirectionDto, type PriceAlertDto } from "./api";

/** Mirrors core/alerts MAX_ACTIVE_ALERTS_PER_USER (pinned by a contract test). */
export const MAX_ACTIVE_ALERTS = 50;

/** Mirrors core/alerts' threshold shape: ≤ 10 integer digits, ≤ 4 decimals. */
export const ALERT_PRICE_RE = /^\d{1,10}(\.\d{1,4})?$/;

/** One key prefix for everything alerts, so one invalidation refreshes the bell and the lists. */
export const ALERTS_KEY = ["alerts"] as const;

export const alertQueries = {
  list: () =>
    queryOptions({
      queryKey: [...ALERTS_KEY, "list"],
      queryFn: api.alerts,
      refetchInterval: 60_000,
    }),
  unreadCount: () =>
    queryOptions({
      queryKey: [...ALERTS_KEY, "unread-count"],
      queryFn: api.alertsUnreadCount,
      refetchInterval: 60_000,
    }),
};

/** Canonical decimal string ("210.5", "0.0001") → integer ten-thousandths. Extra dp truncate. */
export function toPriceUnits(value: string): bigint {
  const [whole = "0", frac = ""] = value.split(".");
  return BigInt(whole || "0") * 10_000n + BigInt(frac.padEnd(4, "0").slice(0, 4) || "0");
}

/** Exact compare of two decimal price strings: -1 | 0 | 1. */
export function comparePrices(a: string, b: string): -1 | 0 | 1 {
  const d = toPriceUnits(a) - toPriceUnits(b);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}

/**
 * What the user typed → the field's text: "$", commas and spaces stripped,
 * only digits and one decimal point, at most 4 decimals kept.
 */
export function sanitizePriceInput(raw: string): string {
  const cleaned = raw.replace(/[,$\s]/g, "").replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const frac = cleaned
    .slice(dot + 1)
    .replace(/\./g, "")
    .slice(0, 4);
  return `${cleaned.slice(0, dot)}.${frac}`;
}

/**
 * "$1,234.50" for a price string, keeping every significant decimal up to 4
 * ("$0.1234", "$210.125") and at least 2 — exact string formatting, so a
 * 4dp threshold is never shown rounded to a different number.
 */
export function formatAlertPrice(value: string): string {
  const [whole = "0", frac = ""] = value.split(".");
  const trimmed = frac.replace(/0+$/, "");
  const decimals = trimmed.length <= 2 ? trimmed.padEnd(2, "0") : trimmed;
  const grouped = BigInt(whole || "0").toLocaleString("en-US");
  return `$${grouped}.${decimals}`;
}

export type AlertPriceCheck =
  | { ok: true; price: string }
  /** `error` is null while the field is empty or mid-typing ("210."). */
  | { ok: false; error: string | null };

/**
 * Pre-check the alert price. Refuses a threshold the current price already
 * meets: an "above" alert at or under the last price (or "below" at or over
 * it) would trigger on the next check, which is never what was meant.
 */
export function checkAlertPrice(
  input: string,
  ctx: { direction: AlertDirectionDto; symbol: string; last: string | null },
): AlertPriceCheck {
  const value = input.trim();
  if (!value || value.endsWith(".")) return { ok: false, error: null };
  if (!ALERT_PRICE_RE.test(value)) {
    return { ok: false, error: "Enter a price with up to 4 decimal places, like 210.00." };
  }
  if (toPriceUnits(value) === 0n) return { ok: false, error: "Enter a price above $0.00." };
  if (ctx.last) {
    const cmp = comparePrices(value, ctx.last);
    if (ctx.direction === "ABOVE" && cmp <= 0) {
      return {
        ok: false,
        error: `${ctx.symbol} is at ${formatAlertPrice(ctx.last)} now. Pick a price above it.`,
      };
    }
    if (ctx.direction === "BELOW" && cmp >= 0) {
      return {
        ok: false,
        error: `${ctx.symbol} is at ${formatAlertPrice(ctx.last)} now. Pick a price below it.`,
      };
    }
  }
  return { ok: true, price: value };
}

/** "above $210.00" / "below $190.50". */
export function alertCondition(alert: Pick<PriceAlertDto, "direction" | "threshold">): string {
  return `${alert.direction === "ABOVE" ? "above" : "below"} ${formatAlertPrice(alert.threshold)}`;
}

/** The row title: "AAPL crossed above $210.00" once triggered, else "AAPL above $210.00". */
export function alertTitle(alert: PriceAlertDto): string {
  return alert.state === "TRIGGERED"
    ? `${alert.symbol} crossed ${alertCondition(alert)}`
    : `${alert.symbol} ${alertCondition(alert)}`;
}

/**
 * "10:42 AM ET" for today (market time), else "Sep 30, 10:42 AM ET". The
 * suffix is plain "ET" (the market's clock), not EDT/EST.
 */
export function formatAlertTime(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  if (day(d) === day(new Date(now))) return `${time} ET`;
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
  return `${date}, ${time} ET`;
}

/** The notification line: "AAPL crossed above $210.00 · 10:42 AM ET". */
export function alertNotification(alert: PriceAlertDto, now = Date.now()): string {
  const at = alert.triggerQuoteAt ?? alert.triggeredAt;
  return at ? `${alertTitle(alert)} · ${formatAlertTime(at, now)}` : alertTitle(alert);
}

/** User-facing copy for a failed alert request (server message when it is a rule). */
export function alertErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError))
    return "The alert couldn't be saved. Check your connection and try again.";
  switch (err.body.subcode) {
    case "ALERT_LIMIT_REACHED":
    case "INVALID_ALERT_PRICE":
    case "INSTRUMENT_INACTIVE":
      return err.body.message;
    case "UNKNOWN_SYMBOL":
      return "This symbol isn't available for alerts.";
  }
  if (err.status === 429) return "Too many changes at once. Wait a moment and try again.";
  if (err.status === 422) return "Check the price and try again.";
  return "The alert couldn't be saved. Try again.";
}
