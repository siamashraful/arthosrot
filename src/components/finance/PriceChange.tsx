import { ArrowDownRight, ArrowUpRight } from "lucide-react";
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
  percent?: number;
  chip?: boolean;
}) {
  if (!amount) return <span className="muted">—</span>;
  const sign = signOf(amount);
  if (sign === 0) {
    return (
      <span className="tabular muted">
        <span className="sr-only">unchanged </span>
        {formatSignedMoney(amount).replace("+", "")}
        {percent !== undefined ? ` (${formatSignedPercent(percent)})` : null}
      </span>
    );
  }
  const Arrow = sign > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`ar-delta tabular ${sign > 0 ? "ar-delta--gain" : "ar-delta--loss"}${
        chip ? " ar-delta--chip" : ""
      }`}
    >
      <Arrow className="ar-icon" size={14} strokeWidth={2.25} aria-hidden />
      <span className="sr-only">{sign > 0 ? "up" : "down"} </span>
      <span>
        {formatSignedMoney(amount)}
        {percent !== undefined ? ` (${formatSignedPercent(percent)})` : null}
      </span>
    </span>
  );
}
