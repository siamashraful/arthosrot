import { formatSignedMoney, formatSignedPercent, signOf } from "@/lib/format";

/**
 * Gain/loss display: color + sign + sr-text — color is never the sole carrier
 * (docs/design/ACCESSIBILITY.md).
 */
export function PriceChange({
  amount,
  percent,
}: {
  /** Signed canonical money string, e.g. "-12.34". */
  amount: string;
  percent?: number;
}) {
  if (!amount) return <span className="muted">—</span>;
  const sign = signOf(amount);
  const cls = sign > 0 ? "gain" : sign < 0 ? "loss" : "muted";
  const srText = sign > 0 ? "up" : sign < 0 ? "down" : "unchanged";
  return (
    <span className={`tabular ${cls}`}>
      <span className="sr-only">{srText} </span>
      {sign === 0 ? formatSignedMoney(amount).replace("+", "") : formatSignedMoney(amount)}
      {percent !== undefined ? ` (${formatSignedPercent(percent)})` : null}
    </span>
  );
}
