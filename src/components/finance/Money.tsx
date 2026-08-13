import { formatMoney, formatSignedMoney } from "@/lib/format";

/** All money renders through this component (uniform format + tabular numerals). */
export function Money({ value, signed = false }: { value: string; signed?: boolean }) {
  if (!value) return <span className="muted">—</span>;
  return <span className="tabular">{signed ? formatSignedMoney(value) : formatMoney(value)}</span>;
}
