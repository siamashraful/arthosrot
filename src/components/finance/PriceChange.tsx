import { Icon } from "@/components/icons/Icon";
import { formatSignedMoney, formatSignedPercent, signOf } from "@/lib/format";

/**
 * A delta carries three signals at once — sign, arrow and colour — so colour
 * is never the sole carrier (docs/design/ACCESSIBILITY.md). Text under 24px
 * sits in gain-text / loss-text via the system's `.ar-delta` rules; the arrow
 * takes the full hue. `chip` wraps it in a tint pill (the hero's delta).
 */
export function PriceChange({
  amount,
  percent,
  chip = false,
}: {
  /** Signed canonical money string, e.g. "-12.34". */
  amount: string;
  /**
   * The move as a percent: the server's exact decimal string ("-1.68") or a
   * number; null/undefined renders the amount alone (e.g. a zero base).
   */
  percent?: number | string | null;
  chip?: boolean;
}) {
  if (!amount) return <span className="ar-tertiary">N/A</span>;
  const sign = signOf(amount);
  const pct = percent === undefined || percent === null ? null : formatSignedPercent(percent);
  if (sign === 0) {
    return (
      <span className="tabular ar-secondary">
        <span className="sr-only">unchanged </span>
        {formatSignedMoney(amount).replace("+", "")}
        {pct !== null ? ` (${pct.replace(/^[+−]/, "")})` : null}
      </span>
    );
  }
  const arrow = sign > 0 ? "arrow-up" : "arrow-down";
  return (
    <span
      className={`ar-delta tabular ${sign > 0 ? "ar-delta--gain" : "ar-delta--loss"}${
        chip ? " ar-delta--chip" : ""
      }`}
    >
      <Icon name={arrow} size={14} stroke={2.25} />
      <span className="sr-only">{sign > 0 ? "up" : "down"} </span>
      <span>
        {formatSignedMoney(amount)}
        {pct !== null ? ` (${pct})` : null}
      </span>
    </span>
  );
}
