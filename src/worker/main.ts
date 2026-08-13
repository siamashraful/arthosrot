import http from "node:http";
import { streamCursorsRepository } from "@/infra/db/repositories/reconciliation";
import { pgTransactionRunner } from "@/infra/db/tx";
import { env } from "@/env";
import { getContainer } from "@/server/container";

/**
 * Ledgerline event/reconciliation worker (ADR-010, EXECUTION.md).
 *
 * - Consumes the broker's replayable event stream from the persisted cursor
 *   (stream_cursors) and applies canonical events via ExecutionService —
 *   exactly-once by unique external ids, so duplicates and replays are safe.
 * - Runs reconciliation on startup and on POST /reconcile (CRON_SECRET-guarded;
 *   the GitHub Actions market-hours schedule calls it — genuine work that also
 *   wakes a slept free-tier instance).
 * - /healthz reports process + last-event/cursor freshness.
 *
 * Deterministic mode: events are in-process (no stream to consume); the worker
 * still serves /healthz and /reconcile so the deployment topology can be
 * exercised locally.
 */

const STREAM = "trades";

let lastEventAt: Date | null = null;
let lastReconcileAt: Date | null = null;

async function startIngestion(): Promise<void> {
  const c = getContainer();
  if (c.deterministicBroker) {
    console.log(JSON.stringify({ msg: "deterministic mode: in-process events; no stream" }));
    return;
  }

  const cursor = await pgTransactionRunner.run((tx) =>
    streamCursorsRepository.get(tx, "ALPACA_PAPER", STREAM),
  );
  console.log(JSON.stringify({ msg: "subscribing to broker stream", sinceUlid: cursor }));

  c.broker.subscribe(cursor ? { lastExternalEventId: cursor } : null, async (event) => {
    await c.executionService.onBrokerEvent(event);
    lastEventAt = new Date();
    if (event.externalEventId) {
      await pgTransactionRunner.run((tx) =>
        streamCursorsRepository.set(tx, "ALPACA_PAPER", STREAM, event.externalEventId!),
      );
    }
  });
}

async function runReconciliation(): Promise<unknown> {
  const result = await getContainer().reconciliationService.reconcileAll();
  lastReconcileAt = new Date();
  return result;
}

function main(): void {
  const { PORT, CRON_SECRET } = env();

  const server = http.createServer((req, res) => {
    const respond = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.url === "/healthz") {
      respond(200, {
        status: "ok",
        role: "worker",
        lastEventAt: lastEventAt?.toISOString() ?? null,
        lastReconcileAt: lastReconcileAt?.toISOString() ?? null,
      });
      return;
    }
    if (req.url === "/reconcile" && req.method === "POST") {
      if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
        respond(401, { status: "unauthorized" });
        return;
      }
      runReconciliation()
        .then((result) => respond(200, { status: "ok", result }))
        .catch((err) => respond(500, { status: "error", error: String(err) }));
      return;
    }
    respond(404, { status: "not-found" });
  });

  server.listen(PORT, () => {
    console.log(JSON.stringify({ msg: "worker listening", port: PORT }));
  });

  // Startup reconciliation heals anything missed while asleep, THEN the
  // stream resumes from the persisted cursor (order matters: reconcile-first
  // bounds staleness even if the stream take a while to connect).
  void runReconciliation()
    .catch((err) =>
      console.error(
        JSON.stringify({ level: "error", msg: "startup reconciliation", err: String(err) }),
      ),
    )
    .then(() => startIngestion())
    .catch((err) =>
      console.error(JSON.stringify({ level: "error", msg: "stream startup", err: String(err) })),
    );
}

main();
