import { priceDelta, type Money } from "../money";
import type { Quote } from "./types";

/**
 * The quote's move against the previous session's close — what every
 * brokerage list shows next to a price. null without a reference close.
 * Display data: never an input to execution or ledger decisions.
 */
export function dayChange(quote: Quote): { absolute: Money; percent: string } | null {
  if (!quote.previousClose) return null;
  return priceDelta(quote.previousClose, quote.last);
}
