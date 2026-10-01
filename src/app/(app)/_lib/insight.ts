import type { IconName } from "@/components/icons/Icon";
import { formatMoney, formatSignedMoney, signOf } from "@/lib/format";

/**
 * The Realized P&L insight's chip (the system's insight card: an xs chip
 * then the label). Kind and direction follow the sign, so a loss never sits
 * beside a rising glyph; zero is neutral.
 */
export function realizedInsightChip(amount: string | undefined): {
  kind: "gain" | "loss" | "neutral";
  icon: IconName;
} {
  const sign = amount === undefined ? 0 : signOf(amount);
  if (sign > 0) return { kind: "gain", icon: "trending-up" };
  if (sign < 0) return { kind: "loss", icon: "trending-down" };
  return { kind: "neutral", icon: "trending-up" };
}

/** Realized P&L as the insight shows it: signed when non-zero, plain "$0.00" at zero. */
export function formatRealizedPnl(amount: string): string {
  return signOf(amount) === 0 ? formatMoney(amount) : formatSignedMoney(amount);
}
