/**
 * Client-side display freshness. The server's `freshness` field (core's
 * displayFreshness) is the authority when a response is built; between
 * refetches a chip keeps ageing on the client and must cross into "stale" on
 * the same threshold. Components may not import core (module boundaries), so
 * the threshold is mirrored here — tests/contract/display-freshness.test.ts
 * pins it to core's DISPLAY_STALE_MS so the two can never drift.
 */

export type DisplayFreshness = "live" | "aging" | "stale" | "at-close";

/** Mirrors core/market-data DISPLAY_STALE_MS. */
export const QUOTE_STALE_AFTER_MS = 120_000;

/** True when a quote stamped `ts` is stale at `now`, or the server already said so. */
export function isQuoteStale(
  ts: string,
  now: number,
  serverFreshness: DisplayFreshness | null = null,
): boolean {
  return serverFreshness === "stale" || now - new Date(ts).getTime() > QUOTE_STALE_AFTER_MS;
}
