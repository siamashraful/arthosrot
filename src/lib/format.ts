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

const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "$4.88T" / "$215.30B" from a canonical money string — large display figures only. */
export function formatCompactMoney(value: string): string {
  return compactMoney.format(Number(value)); // presentation only
}

/** Prices display at 2dp ("200.10") from 4dp canonical strings. */
export function formatPrice(value: string): string {
  if (!value) return "N/A";
  const n = Number(value);
  return money.format(n).replace("$", "$");
}

/** 4dp price for tooltips/avg-cost detail. */
export function formatPrice4(value: string): string {
  return value ? `$${value}` : "N/A";
}

/**
 * "+1.23%" / "−1.23%". A string is the server's exact decimal percent
 * ("-1.68") and is shown as sent — no float round-trip.
 */
export function formatSignedPercent(value: number | string): string {
  if (typeof value === "string") {
    const sign = signOf(value) < 0 ? "−" : "+";
    return `${sign}${value.replace(/^[-+]/, "")}%`;
  }
  const sign = value < 0 ? "−" : "+";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export function formatTime(iso: string): string {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}

export function formatDateTime(iso: string): string {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

/**
 * "Sep 30, 2026" in market time (ET). A date-only string ("2026-09-30") is
 * read as that calendar day — anchored at midday UTC, which is the same day
 * in New York.
 */
export function formatDate(iso: string): string {
  if (!iso) return "N/A";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00Z` : iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

/** The market-time (ET) calendar day of an instant, "2026-09-30" — a grouping key. */
export function marketDay(iso: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** A day heading for grouped lists: "Today", "Yesterday", else "Sep 30, 2026" (ET). */
export function formatDayLabel(iso: string, now = Date.now()): string {
  const day = marketDay(iso);
  if (day === marketDay(new Date(now).toISOString())) return "Today";
  if (day === marketDay(new Date(now - 86_400_000).toISOString())) return "Yesterday";
  return formatDate(day);
}

/** "$10,000" — a whole-dollar amount (the onboarding starting-cash slider). */
export function formatWholeDollars(dollars: number): string {
  return `$${Math.trunc(dollars).toLocaleString("en-US")}`;
}

/** "1 share" / "10 shares" / "1,000 shares" from a whole-share quantity. */
export function formatShares(qty: string | number): string {
  const s = String(qty);
  const grouped = /^\d+$/.test(s) ? BigInt(s).toLocaleString("en-US") : s;
  return `${grouped} ${s === "1" ? "share" : "shares"}`;
}

/** An order's type in words: "Market" / "Limit $150.00". */
export function formatOrderType(type: "MARKET" | "LIMIT", limitPrice: string | null): string {
  return type === "MARKET" ? "Market" : `Limit ${formatPrice(limitPrice ?? "")}`;
}

/** The market session in words: "Market open", "Pre-market", … */
export function formatMarketStatus(status: string): string {
  switch (status) {
    case "OPEN":
      return "Market open";
    case "CLOSED":
      return "Market closed";
    case "PRE":
      return "Pre-market";
    case "POST":
      return "After hours";
    default:
      return `Market ${status.toLowerCase()}`;
  }
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
