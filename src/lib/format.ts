/**
 * The ONLY sanctioned number formatting (docs/design/DESIGN_SYSTEM.md):
 * components never hand-format financial values. API money/prices arrive as
 * strings and stay strings — no float arithmetic here, presentation only.
 */

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "$1,234.56" / "-$1,234.56" from a canonical "1234.56" string. */
export function formatMoney(value: string): string {
  const negative = value.startsWith("-");
  const [whole = "0", frac = "00"] = (negative ? value.slice(1) : value).split(".");
  const grouped = Number(whole).toLocaleString("en-US");
  return `${negative ? "-" : ""}$${grouped}.${frac.padEnd(2, "0").slice(0, 2)}`;
}

/** Signed variant: always shows +/− (gain/loss displays). */
export function formatSignedMoney(value: string): string {
  if (value.startsWith("-")) return `−${formatMoney(value.slice(1))}`;
  return `+${formatMoney(value)}`;
}

/** Prices display at 2dp ("200.10") from 4dp canonical strings. */
export function formatPrice(value: string): string {
  if (!value) return "—";
  const n = Number(value);
  return money.format(n).replace("$", "$");
}

/** 4dp price for tooltips/avg-cost detail. */
export function formatPrice4(value: string): string {
  return value ? `$${value}` : "—";
}

/** "+1.23%" / "−1.23%" */
export function formatSignedPercent(value: number): string {
  const sign = value < 0 ? "−" : "+";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export function formatTime(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}

export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export function relativeAge(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

/** Sign of a canonical decimal string: -1 | 0 | 1. */
export function signOf(value: string): -1 | 0 | 1 {
  if (/^-0*\.?0*$/.test(value) || /^0*\.?0*$/.test(value)) return 0;
  return value.startsWith("-") ? -1 : 1;
}
