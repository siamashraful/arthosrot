import { describe, expect, it } from "vitest";
import { derivePipelineHealth, PIPELINE_STALE_MS } from "./health";

/**
 * Pipeline health drove a real production bug: alpaca-paper mode hard-coded
 * "UNKNOWN", so the degraded banner showed permanently. The derivation is
 * pure so every branch is pinned here.
 */

const now = new Date("2026-09-03T15:00:00Z");
const iso = (agoMs: number) => new Date(now.getTime() - agoMs).toISOString();

describe("derivePipelineHealth", () => {
  it("deterministic mode is definitionally live", () => {
    expect(
      derivePipelineHealth({ deterministic: true, heartbeatIso: null, marketOpen: true, now }),
    ).toBe("LIVE");
  });

  it("fresh heartbeat while the market is open is live", () => {
    expect(
      derivePipelineHealth({
        deterministic: false,
        heartbeatIso: iso(5 * 60_000),
        marketOpen: true,
        now,
      }),
    ).toBe("LIVE");
  });

  it("stale or missing heartbeat while the market is open is delayed", () => {
    expect(
      derivePipelineHealth({
        deterministic: false,
        heartbeatIso: iso(PIPELINE_STALE_MS + 1),
        marketOpen: true,
        now,
      }),
    ).toBe("DELAYED");
    expect(
      derivePipelineHealth({ deterministic: false, heartbeatIso: null, marketOpen: true, now }),
    ).toBe("DELAYED");
  });

  it("a stale heartbeat off-hours is normal, not degradation (cron sleeps by design)", () => {
    expect(
      derivePipelineHealth({
        deterministic: false,
        heartbeatIso: iso(12 * 60 * 60_000),
        marketOpen: false,
        now,
      }),
    ).toBe("LIVE");
  });

  it("an unparseable heartbeat fails safe to delayed", () => {
    expect(
      derivePipelineHealth({
        deterministic: false,
        heartbeatIso: "not-a-date",
        marketOpen: true,
        now,
      }),
    ).toBe("DELAYED");
  });
});
