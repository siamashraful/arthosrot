import type { Px, Qty } from "../money";

/**
 * Ledger descriptions for trades ("Bought 10 AAPL at $200.10"). The price is
 * the exact fill price — never rounded — shown as money: trailing zeros past
 * the cents are dropped, real sub-penny digits are kept ($410.7052).
 */
export function formatFillPrice(price: Px): string {
  const [whole = "0", frac = ""] = price.toString().split(".");
  const trimmed = frac.replace(/0+$/, "");
  const cents = trimmed.length <= 2 ? trimmed.padEnd(2, "0") : trimmed;
  return `$${Number(whole).toLocaleString("en-US")}.${cents}`;
}

export function describeTrade(side: "BUY" | "SELL", qty: Qty, symbol: string, price: Px): string {
  const verb = side === "BUY" ? "Bought" : "Sold";
  return `${verb} ${qty.toString()} ${symbol} at ${formatFillPrice(price)}`;
}
