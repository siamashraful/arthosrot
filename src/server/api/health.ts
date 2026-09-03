import { sql } from "drizzle-orm";
import { systemClock } from "@/core/shared";
import { getDb } from "@/infra/db";
import { streamCursorsRepository } from "@/infra/db/repositories/reconciliation";
import { pgTransactionRunner } from "@/infra/db/tx";
import { getContainer } from "../container";

/** Readiness: critical internal dependencies only (DEPLOYMENT.md). */
export async function checkReady(): Promise<boolean> {
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

/** Heartbeat staleness budget: 3 missed reconcile beats (10-min cron cadence). */
export const PIPELINE_STALE_MS = 30 * 60_000;

/**
 * Pipeline health for the UI banner. Deterministic mode is in-process —
 * definitionally live. For an external broker the worker's reconcile
 * heartbeat is the signal; while the market is not OPEN the venue produces
 * no fills (and the market-hours cron sleeps by design), so a stale
 * heartbeat off-hours is normal, not degradation.
 */
export function derivePipelineHealth(input: {
  deterministic: boolean;
  heartbeatIso: string | null;
  marketOpen: boolean;
  now: Date;
}): "LIVE" | "DELAYED" {
  if (input.deterministic) return "LIVE";
  if (!input.marketOpen) return "LIVE";
  if (!input.heartbeatIso) return "DELAYED";
  const at = Date.parse(input.heartbeatIso);
  return Number.isFinite(at) && input.now.getTime() - at < PIPELINE_STALE_MS ? "LIVE" : "DELAYED";
}

/**
 * Pipeline/provider health for the UI banner. Served from cached/derived
 * state (market-status memo + the worker's reconcile heartbeat row) — never
 * spends vendor market-data calls on monitoring.
 */
export async function getSystemStatus(): Promise<unknown> {
  const c = getContainer();
  const market = await c.marketData.getMarketStatus();
  const heartbeatIso = c.deterministicBroker
    ? null
    : await pgTransactionRunner.run((tx) =>
        streamCursorsRepository.get(tx, c.broker.kind, "reconcile-heartbeat"),
      );
  return {
    market: { status: market.status, asOf: market.asOf.toISOString() },
    broker: {
      kind: c.broker.kind,
      pipeline: derivePipelineHealth({
        deterministic: c.deterministicBroker !== null,
        heartbeatIso,
        marketOpen: market.status === "OPEN",
        now: systemClock.now(),
      }),
      lastSyncAt: heartbeatIso,
    },
  };
}
