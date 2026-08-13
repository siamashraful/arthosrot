import { jsonResponse, withAuth } from "@/server/api/http";
import { getContainer } from "@/server/container";

/**
 * Pipeline/provider health for the UI banner. Served from cached/derived
 * state — never spends vendor market-data calls on monitoring.
 */
export const GET = withAuth(async () => {
  const c = getContainer();
  const market = await c.marketData.getMarketStatus();
  return jsonResponse({
    market: { status: market.status, asOf: market.asOf.toISOString() },
    broker: {
      kind: c.broker.kind,
      // Deterministic mode is in-process: the pipeline is definitionally live.
      // The alpaca-paper worker publishes reconciliation health here (phase 9).
      pipeline: c.deterministicBroker ? "LIVE" : "UNKNOWN",
    },
  });
});
