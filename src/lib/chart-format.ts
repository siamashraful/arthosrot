/**
 * Chart scrub presentation: the change between two plotted prices and the
 * timestamp label for the bar under the cursor. Presentation only — never an
 * input to an execution or ledger decision.
 *
 * The change is computed EXACTLY on the canonical decimal strings (scaled
 * BigInt), not on floats: a readout that says "+$3.20" must match the two
 * prices it sits between, to the cent.
 */

const SCALE = 4; // canonical prices are 4dp strings

function toUnits(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole = "0", frac = ""] = (negative ? value.slice(1) : value).split(".");
  const units =
    BigInt(whole || "0") * 10n ** BigInt(SCALE) +
    BigInt(frac.padEnd(SCALE, "0").slice(0, SCALE) || "0");
  return negative ? -units : units;
}

/** Round-half-even integer division (the platform's rounding everywhere). */
function divHalfEven(n: bigint, d: bigint): bigint {
  const negative = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  let q = an / ad;
  const twice = (an % ad) * 2n;
  if (twice > ad || (twice === ad && q % 2n === 1n)) q += 1n;
  return negative ? -q : q;
}

function unitsToString(units: bigint, dp: number): string {
  const negative = units < 0n;
  const abs = (negative ? -units : units).toString().padStart(dp + 1, "0");
  const whole = abs.slice(0, abs.length - dp);
  const frac = abs.slice(abs.length - dp);
  return `${negative ? "-" : ""}${whole}${dp > 0 ? `.${frac}` : ""}`;
}

export interface PriceChange {
  /** Signed, 2dp ("3.20", "-0.45", "0.00"). */
  absolute: string;
  /** Signed, 2dp percent ("1.28"), or null when the base is zero. */
  percent: string | null;
  direction: -1 | 0 | 1;
}

/** Change from `from` to `to`, both canonical decimal strings. */
export function priceChange(from: string, to: string): PriceChange {
  const a = toUnits(from);
  const b = toUnits(to);
  const diff = b - a; // 4dp units
  const absolute = unitsToString(divHalfEven(diff, 100n), 2); // → cents
  const percent = a === 0n ? null : unitsToString(divHalfEven(diff * 10_000n, a), 2); // → basis points
  const direction = absolute === "0.00" || absolute === "-0.00" ? 0 : diff < 0n ? -1 : 1;
  return {
    absolute: absolute === "-0.00" ? "0.00" : absolute,
    percent: percent === "-0.00" ? "0.00" : percent,
    direction,
  };
}

/** A bar resolution — the net-worth "ALL" view passes its resolvedRange. */
export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y";

const ET = "America/New_York";

/**
 * The scrub label for one bar, at the resolution the range's bars have
 * (market time, ET — the venue's clock): an intraday bar gets its time, a
 * daily bar its date, a weekly bar its week.
 */
export function formatScrubTime(iso: string, range: ChartRange): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ET });
  const day = (opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-US", { ...opts, timeZone: ET });
  switch (range) {
    case "1D": // the day too: off-hours, 1D is the LAST session, not today
    case "1W":
      return `${day({ weekday: "short", month: "short", day: "numeric" })} · ${time} ET`;
    case "5Y":
      return `Week of ${day({ month: "short", day: "numeric", year: "numeric" })}`;
    default:
      return day({ weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
}
