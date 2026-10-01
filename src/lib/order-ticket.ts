/**
 * Trading-ticket input handling and pre-checks (docs/design/UX_PATTERNS.md →
 * Trading ticket). Presentation-side only: the server re-validates every rule
 * in decimal under the placement lock and stays the authority. Money is
 * handled EXACTLY — prices as integer ten-thousandths, totals as integer
 * cents (BigInt) — never parseFloat or JS number arithmetic on money
 * (FINANCIAL_INVARIANTS.md).
 */

import { ApiError, type QuoteDto } from "./api";
import { centsToString, toCents } from "./cash-transfer";
import { formatMoney, formatShares } from "./format";

/** Server cap on one order's quantity (src/server/api/orders.ts). */
export const MAX_ORDER_QTY = 1_000_000;

export type FieldCheck<T> =
  | { ok: true; value: T }
  /** `error` is null while the field is empty or mid-typing: nothing to complain about yet. */
  | { ok: false; error: string | null };

/** What the user typed → the quantity field's text: digits only. */
export function sanitizeQtyInput(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

/** What the user typed → the limit-price field's text: digits, one point, ≤ 4 decimals. */
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

export function checkQty(input: string): FieldCheck<number> {
  if (input === "") return { ok: false, error: null };
  if (!/^\d+$/.test(input)) return { ok: false, error: "Enter a whole number of shares." };
  const n = BigInt(input);
  if (n === 0n) return { ok: false, error: "Enter at least 1 share." };
  if (n > BigInt(MAX_ORDER_QTY)) {
    return {
      ok: false,
      error: `One order can be at most ${MAX_ORDER_QTY.toLocaleString("en-US")} shares.`,
    };
  }
  return { ok: true, value: Number(n) };
}

/** A complete, positive limit price → its canonical string ("0150.5" → "150.5"). */
export function checkLimitPrice(input: string): FieldCheck<string> {
  if (input === "" || /^\d*\.$/.test(input)) return { ok: false, error: null }; // mid-typing
  const m = /^(\d*)(?:\.(\d{1,4}))?$/.exec(input);
  if (!m) return { ok: false, error: "Enter a price like 150 or 150.25." };
  if (priceUnits(input) === 0n) return { ok: false, error: "Limit price must be more than $0." };
  const whole = BigInt(m[1] || "0").toString();
  return { ok: true, value: m[2] ? `${whole}.${m[2]}` : whole };
}

/** A canonical price string ("200.1", "150") → integer ten-thousandths of a dollar. */
function priceUnits(price: string): bigint {
  const [whole = "0", frac = ""] = price.split(".");
  return BigInt(whole || "0") * 10_000n + BigInt(frac.padEnd(4, "0").slice(0, 4) || "0");
}

/**
 * price × qty, exact, rounded once to the cent HALF_EVEN (the same rounding
 * the server's notional uses). Returns a canonical "1234.56" string.
 */
export function estimateNotional(price: string, qty: number): string {
  const units = priceUnits(price) * BigInt(qty); // ten-thousandths of a dollar
  let cents = units / 100n;
  const rest = units % 100n;
  if (rest > 50n || (rest === 50n && cents % 2n === 1n)) cents += 1n;
  return centsToString(cents);
}

/**
 * What the server will HOLD for a market buy: price × qty × (1 + buffer),
 * exact, rounded once to the cent HALF_EVEN — the same rule as core/money
 * reserveWithBuffer (pinned by tests/contract/ticket-reserve-parity.test.ts).
 * `buffer` is a decimal ratio string ("0.025").
 */
export function reserveWithBuffer(price: string, qty: number, buffer: string): string {
  const [, frac = ""] = buffer.split(".");
  const scale = 10n ** BigInt(frac.length);
  const ratio = BigInt(buffer.replace(".", "") || "0"); // buffer × scale
  // ten-thousandths × (scale + ratio) / scale → ten-thousandths; then to cents
  const numerator = priceUnits(price) * BigInt(qty) * (scale + ratio);
  const denominator = scale * 100n; // → cents
  let cents = numerator / denominator;
  const twice = (numerator % denominator) * 2n;
  if (twice > denominator || (twice === denominator && cents % 2n === 1n)) cents += 1n;
  return centsToString(cents);
}

/** "0.025" → "2.5%" (display only; the ratio string is exact). */
function formatBufferPercent(buffer: string): string {
  const [whole = "0", frac = ""] = buffer.split(".");
  const units = BigInt(whole) * 10n ** BigInt(frac.length) + BigInt(frac || "0"); // ratio × 10^d
  const scaled = units * 100n; // percent × 10^d
  const d = frac.length;
  const str = scaled.toString().padStart(d + 1, "0");
  const int = str.slice(0, str.length - d) || "0";
  const dec = d ? str.slice(str.length - d).replace(/0+$/, "") : "";
  return `${int}${dec ? `.${dec}` : ""}%`;
}

/** The quote a ticket estimates against: the ask for buys, the bid for sells, last as fallback. */
export function referencePrice(quote: QuoteDto | null, side: "BUY" | "SELL"): string | null {
  if (!quote) return null;
  return (side === "BUY" ? quote.ask : quote.bid) ?? quote.last;
}

/**
 * Orders that are certain to be rejected, caught before review so the user
 * learns before submitting. Market buys also reserve a price buffer that only
 * the server applies — a buy just under buying power can still be refused at
 * submit, which `placeOrderError` explains.
 */
export function ticketPrecheck(input: {
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  /** estimated cost/proceeds, canonical money; null when there is no price to estimate with */
  estimate: string | null;
  buyingPower: string;
  sellable: string;
  /** Market buys only: what the server will hold (reserveWithBuffer) — checked against buying power. */
  reserve?: string | null;
  /** The buffer ratio behind `reserve`, for the explanation ("0.025" → 2.5%). */
  buffer?: string;
}): string | null {
  if (input.side === "SELL") {
    const sellable = BigInt(/^\d+$/.test(input.sellable) ? input.sellable : "0");
    if (sellable === 0n) return `You don't hold any ${input.symbol} to sell.`;
    if (BigInt(input.qty) > sellable) return `You can sell up to ${formatShares(input.sellable)}.`;
    return null;
  }
  if (input.estimate !== null && toCents(input.estimate) > toCents(input.buyingPower)) {
    return `Estimated cost is more than your buying power (${formatMoney(input.buyingPower)}).`;
  }
  if (input.reserve && toCents(input.reserve) > toCents(input.buyingPower)) {
    const pct = input.buffer ? `${formatBufferPercent(input.buffer)} ` : "";
    return `Market buys hold ${pct}above the ask until they fill. This order needs ${formatMoney(input.reserve)}, more than your buying power (${formatMoney(input.buyingPower)}). Try fewer shares or a limit order.`;
  }
  return null;
}

/**
 * A failed placement in plain words. `retryable` = the same order intent may
 * be confirmed again with the SAME idempotency key: a network failure or a
 * server error may have happened after the order was recorded, and a replay
 * returns that order instead of placing a second one.
 */
export function placeOrderError(err: unknown): { message: string; retryable: boolean } {
  const uncertain = {
    message:
      "We couldn't confirm the order went through. Confirming again is safe: it won't be placed twice.",
    retryable: true,
  };
  if (!(err instanceof ApiError)) return uncertain;
  switch (err.body.subcode) {
    case "INSUFFICIENT_BUYING_POWER":
      return {
        message:
          "Not enough buying power for this order. Market buys hold a small buffer above the ask. Try fewer shares or a limit order.",
        retryable: false,
      };
    case "INSUFFICIENT_HOLDINGS":
      return {
        message:
          "You don't have enough sellable shares. Shares in open sell orders are already reserved.",
        retryable: false,
      };
    case "INSTRUMENT_INACTIVE":
      return {
        message: "This symbol is no longer tradable. Shares you hold can still be sold.",
        retryable: false,
      };
    case "ACCOUNT_NOT_ACTIVE":
      return {
        message: "Your practice account isn't open yet. Finish opening it on the dashboard.",
        retryable: false,
      };
  }
  if (err.body.code === "RATE_LIMITED") {
    return {
      message: "Too many orders in a short time. Wait a moment, then confirm again.",
      retryable: true,
    };
  }
  if (err.body.code === "PROVIDER_UNAVAILABLE") {
    return {
      message:
        "Market data is unavailable, so the order can't be priced right now. Try again shortly.",
      retryable: true,
    };
  }
  if (err.status >= 500) return uncertain;
  return { message: err.message, retryable: false };
}
