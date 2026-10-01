import { Icon } from "@/components/icons/Icon";
import { formatRealizedPnl, realizedInsightChip } from "./insight";

/**
 * The Realized P&L insight card (Dashboard and Portfolio): the sign-following
 * chip, the label, and the value — signed when non-zero. Lives inside an
 * `.ar-insight-row`.
 */
export function RealizedPnlInsight({ amount }: { amount: string }) {
  const chip = realizedInsightChip(amount);
  return (
    <div className="ar-insight">
      <span className="ar-insight__head">
        <span className={`ar-chipicon ar-chipicon--xs ar-chipicon--${chip.kind}`} aria-hidden>
          <Icon name={chip.icon} />
        </span>
        Realized P&L
      </span>
      <span className="ar-insight__value tabular">{formatRealizedPnl(amount)}</span>
    </div>
  );
}
