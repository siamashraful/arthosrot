import type { AlertEvaluationResult } from "@/core/alerts";
import { env } from "@/env";
import { getContainer } from "@/server/container";
import { parseDuration } from "./duration";
import { defineJob } from "./registry";

export const PRICE_ALERTS_JOB = "price-alerts";

/**
 * Evaluate every ACTIVE price alert (ADR-016): one market-status check, the
 * alerted symbols batched into the CACHED quote provider (the same quotes
 * the UI shows, sharing its cache), and a conditional ACTIVE → TRIGGERED
 * update per match — so an overlapping tick, or a user's GET evaluating the
 * same alert, can never trigger it twice. Off-session runs return at once
 * without fetching quotes. Always enabled: the run is a cheap no-op when no
 * alert is ACTIVE, and staying enabled keeps /healthz's overdue rule honest.
 */
export function priceAlertsJob(
  evaluate: () => Promise<AlertEvaluationResult> = () =>
    getContainer().priceAlertService.evaluateAll(),
) {
  return defineJob({
    name: PRICE_ALERTS_JOB,
    intervalMs: parseDuration(env().ALERTS_CHECK_INTERVAL),
    leaseMs: 10 * 60_000,
    run: evaluate,
  });
}
