import { describe, expect, it } from "vitest";
import { DISPLAY_STALE_MS } from "@/core/market-data";
import { isQuoteStale, QUOTE_STALE_AFTER_MS } from "@/lib/freshness";

/** The client's ageing freshness chip must flip to "stale" exactly where core does. */
describe("client display freshness", () => {
  it("mirrors core's stale threshold", () => {
    expect(QUOTE_STALE_AFTER_MS).toBe(DISPLAY_STALE_MS);
  });

  it("ages a quote into stale on the client, and honours a stale server verdict", () => {
    const ts = "2026-10-01T14:00:00.000Z";
    const t0 = Date.parse(ts);
    expect(isQuoteStale(ts, t0 + DISPLAY_STALE_MS)).toBe(false);
    expect(isQuoteStale(ts, t0 + DISPLAY_STALE_MS + 1)).toBe(true);
    expect(isQuoteStale(ts, t0, "stale")).toBe(true);
    expect(isQuoteStale(ts, t0, "live")).toBe(false);
  });
});
