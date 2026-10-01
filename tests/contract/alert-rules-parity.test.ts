import { describe, expect, it } from "vitest";
import { MAX_ACTIVE_ALERTS_PER_USER, parseAlertThreshold } from "@/core/alerts";
import { ALERT_PRICE_RE, MAX_ACTIVE_ALERTS } from "@/lib/alerts";

/**
 * The alert sheet pre-checks prices with a client mirror of core's rules
 * (components may not import core). Pin the two together so they can't drift:
 * every sample the client accepts, core accepts, and vice versa.
 */
describe("client alert rules mirror core/alerts", () => {
  it("same active-alert cap", () => {
    expect(MAX_ACTIVE_ALERTS).toBe(MAX_ACTIVE_ALERTS_PER_USER);
  });

  it.each([
    "210",
    "210.5",
    "210.1234",
    "210.12345",
    "0.0001",
    "1234567890",
    "12345678901",
    "1e3",
    "-1",
    "",
    "210.",
    ".5",
  ])("shape of %j agrees", (sample) => {
    const client = ALERT_PRICE_RE.test(sample);
    let server = true;
    try {
      parseAlertThreshold(sample);
    } catch {
      server = false;
    }
    // core additionally refuses zero; none of these samples is zero
    expect(client).toBe(server);
  });
});
