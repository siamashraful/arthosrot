import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  HandCoins,
  Layers,
  Receipt,
  SlidersHorizontal,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * The app's financial glyph vocabulary — one glyph per concept, everywhere
 * (sidebar style: lucide outline at the `--icon-stroke` weight). A concept
 * never borrows a direction or performance glyph: holdings are layers, not a
 * rising line; a trade is an exchange, not a trend.
 */
export const FINANCE_GLYPHS = {
  cash: Wallet, // cash balance / liquidity
  "buying-power": Banknote, // spendable money
  positions: Layers, // holdings, stocked exposure
  realized: HandCoins, // profit or loss taken off the table
  trade: ArrowLeftRight, // an exchange of cash for shares
  deposit: ArrowDownLeft, // money in
  withdrawal: ArrowUpRight, // money out
  fee: Receipt,
  adjustment: SlidersHorizontal,
} as const satisfies Record<string, LucideIcon>;

export type FinanceConcept = keyof typeof FINANCE_GLYPHS;

/**
 * A metric label's glyph: unboxed, in the label's own colour, decorative.
 * Colour never lives here — a metric's meaning (gain, loss) is carried by its
 * value, so the glyph stays quiet and the number stays the strongest thing.
 */
export function MetricIcon({ type }: { type: FinanceConcept }) {
  const Glyph = FINANCE_GLYPHS[type];
  return <Glyph className="metric-icon" aria-hidden />;
}
