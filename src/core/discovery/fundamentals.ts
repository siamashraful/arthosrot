import type { Candle } from "../market-data";
import { Px } from "../money";

/**
 * Key-stats rules for the instrument page — display data, never an input to
 * execution, reservations or the ledger. Arithmetic is exact: values are
 * scaled to 4dp integers (BigInt), never JS floats.
 */

/** One reported diluted-EPS fact (a period's earnings per share). */
export interface EpsFact {
  start: string; // ISO date
  end: string; // ISO date
  /** 4dp decimal string, may be negative ("-0.4200"). */
  value: string;
}

/** Read port: a filer's reported EPS history (infra/sec-edgar implements it). */
export interface EarningsSource {
  epsHistory(cik: string): Promise<EpsFact[] | null>;
}

export interface TrailingEps {
  eps: string; // 4dp
  /** ttm = last 12 months; fy = last fiscal year (no matching YTD pair). */
  basis: "ttm" | "fy";
  periodEnd: string;
}

const DAY = 86_400_000;
const SCALE = 10_000n;

const days = (f: EpsFact) => (Date.parse(f.end) - Date.parse(f.start)) / DAY;

function units(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole = "0", frac = ""] = (negative ? value.slice(1) : value).split(".");
  const u = BigInt(whole || "0") * SCALE + BigInt((frac + "0000").slice(0, 4) || "0");
  return negative ? -u : u;
}

function fromUnits(u: bigint): string {
  const negative = u < 0n;
  const abs = (negative ? -u : u).toString().padStart(5, "0");
  return `${negative ? "-" : ""}${abs.slice(0, -4)}.${abs.slice(-4)}`;
}

/**
 * Trailing-twelve-month EPS the way filings allow it: the last fiscal year,
 * plus this year's year-to-date, minus last year's same YTD period
 * (= the last four quarters, including a fourth quarter that only exists
 * inside the annual report). Falls back to the last fiscal year when the
 * YTD pair is missing; null when nothing is recent enough (> 15 months old).
 */
export function trailingEps(facts: readonly EpsFact[], now: Date): TrailingEps | null {
  const annual = facts
    .filter((f) => days(f) >= 350 && days(f) <= 380)
    .sort((a, b) => b.end.localeCompare(a.end))[0];
  if (!annual || now.getTime() - Date.parse(annual.end) > 456 * DAY) return null;

  const ytd = facts
    .filter((f) => f.end > annual.end && days(f) < 350 && days(f) >= 80)
    .sort((a, b) => b.end.localeCompare(a.end) || days(b) - days(a))[0];
  if (ytd) {
    const target = Date.parse(ytd.end) - 365 * DAY;
    const prior = facts.find(
      (f) =>
        Math.abs(Date.parse(f.end) - target) <= 15 * DAY && Math.abs(days(f) - days(ytd)) <= 10,
    );
    if (prior) {
      const eps = units(annual.value) + units(ytd.value) - units(prior.value);
      return { eps: fromUnits(eps), basis: "ttm", periodEnd: ytd.end };
    }
  }
  return { eps: fromUnits(units(annual.value)), basis: "fy", periodEnd: annual.end };
}

/**
 * Price ÷ EPS to one decimal (half-even). null when earnings are zero or
 * negative — a P/E of a loss is not a number worth printing.
 */
export function priceToEarnings(price: Px, eps: string): string | null {
  const e = units(eps);
  if (e <= 0n) return null;
  const p = units(price.toString());
  // ratio × 10, rounded half-even
  const n = p * 10n;
  let q = n / e;
  const twice = (n % e) * 2n;
  if (twice > e || (twice === e && q % 2n === 1n)) q += 1n;
  const s = q.toString().padStart(2, "0");
  return `${s.slice(0, -1)}.${s.slice(-1)}`;
}

/**
 * 52-week high/low from daily bars inside the last 365 days, widened by the
 * live last price (today's move can set a new extreme before its bar exists).
 */
export function fiftyTwoWeekRange(
  candles: readonly Candle[],
  now: Date,
  last: Px | null,
): { high: Px; low: Px } | null {
  const since = now.getTime() - 365 * DAY;
  let high: Px | null = null;
  let low: Px | null = null;
  for (const c of candles) {
    if (Date.parse(c.time) < since) continue;
    const h = Px.fromString(c.high);
    const l = Px.fromString(c.low);
    high = high ? high.max(h) : h;
    low = low ? low.min(l) : l;
  }
  if (!high || !low) return null;
  if (last) {
    high = high.max(last);
    low = low.min(last);
  }
  return { high, low };
}
