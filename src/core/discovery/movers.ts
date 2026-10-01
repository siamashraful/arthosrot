/**
 * Top movers — the day's biggest gainers and losers by percent change vs the
 * previous close. Pure ranking over already-derived day changes (core
 * market-data `dayChange`), compared EXACTLY as decimal strings — never as
 * floats, so "1.10" vs "1.09" can't flip on a rounding artefact.
 *
 * Display data only: never an input to execution, reservations or the ledger.
 */

export const MOVERS_LIMIT = 5;

const DECIMAL_RE = /^(-?)(\d+)(?:\.(\d+))?$/;

/** A signed decimal string as an exact scaled integer: ("-1.5", 2) → -150n. */
function toScaled(value: string, scale: number): bigint {
  const m = DECIMAL_RE.exec(value);
  if (!m) throw new Error(`invalid decimal string: ${JSON.stringify(value)}`);
  const [, sign, whole, frac = ""] = m;
  const digits = `${whole}${frac.padEnd(scale, "0")}`;
  const n = BigInt(digits);
  return sign === "-" ? -n : n;
}

/** Exact comparison of two decimal strings of any precision: -1 | 0 | 1. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const scale = Math.max(a.split(".")[1]?.length ?? 0, b.split(".")[1]?.length ?? 0);
  const x = toScaled(a, scale);
  const y = toScaled(b, scale);
  return x < y ? -1 : x > y ? 1 : 0;
}

export interface MoverCandidate {
  symbol: string;
  /** The day change percent as an exact decimal string ("4.10", "-12.50"). */
  percent: string;
}

/**
 * Rank candidates into gainers (percent > 0, biggest first) and losers
 * (percent < 0, biggest drop first), at most `limit` each. Unchanged symbols
 * are neither. Ties break by symbol so the order is deterministic. Symbols
 * are de-duplicated (first occurrence wins).
 */
export function rankMovers<T extends MoverCandidate>(
  candidates: readonly T[],
  limit: number = MOVERS_LIMIT,
): { gainers: T[]; losers: T[] } {
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    if (seen.has(c.symbol)) return false;
    seen.add(c.symbol);
    return true;
  });
  const bySymbol = (a: T, b: T) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0);
  const gainers = unique
    .filter((c) => compareDecimal(c.percent, "0") > 0)
    .sort((a, b) => compareDecimal(b.percent, a.percent) || bySymbol(a, b))
    .slice(0, limit);
  const losers = unique
    .filter((c) => compareDecimal(c.percent, "0") < 0)
    .sort((a, b) => compareDecimal(a.percent, b.percent) || bySymbol(a, b))
    .slice(0, limit);
  return { gainers, losers };
}
