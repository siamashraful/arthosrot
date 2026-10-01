import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { closeDb } from "@/infra/db";
import { streamCursorsRepository } from "@/infra/db/repositories/reconciliation";
import { pgTransactionRunner } from "@/infra/db/tx";
import { env } from "@/env";
import { getContainer } from "@/server/container";
import { jobRunsRepository } from "@/infra/db/repositories/job-runs";
import { allJobs, runDueJobs } from "./jobs";

/**
 * Arthosrot event/reconciliation worker (ADR-010, EXECUTION.md).
 *
 * - Consumes the broker's replayable event stream from the persisted cursor
 *   (stream_cursors) and applies canonical events via ExecutionService —
 *   exactly-once by unique external ids, so duplicates and replays are safe.
 * - Runs reconciliation on startup and on POST /reconcile (CRON_SECRET-guarded;
 *   the GitHub Actions market-hours schedule calls it — genuine work that also
 *   wakes a slept free-tier instance).
 * - Runs scheduled jobs (src/worker/jobs) that are due — on startup and on
 *   POST /jobs/tick (CRON_SECRET-guarded; an hourly GitHub Actions cron
 *   calls it). Each job owns its interval; the tick only asks "anything due?".
 * - /healthz reports process + last-event/cursor freshness + job status.
 *
 * Deterministic mode: events are in-process (no stream to consume); the worker
 * still serves /healthz and /reconcile so the deployment topology can be
 * exercised locally.
 */

const STREAM = "trades";

let lastEventAt: Date | null = null;
let lastReconcileAt: Date | null = null;
let subscription: { close(): void } | null = null;

/** Constant-time bearer check — a string !== leaks match length via timing. */
function bearerMatches(header: string | undefined, secret: string): boolean {
  const presented = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

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

  subscription = c.broker.subscribe(
    cursor ? { lastExternalEventId: cursor } : null,
    async (event) => {
      await c.executionService.onBrokerEvent(event);
      lastEventAt = new Date();
      if (event.externalEventId) {
        await pgTransactionRunner.run((tx) =>
          streamCursorsRepository.set(tx, "ALPACA_PAPER", STREAM, event.externalEventId!),
        );
      }
    },
  );
}

async function runReconciliation(): Promise<unknown> {
  const c = getContainer();
  // Activate accounts whose venue funding has settled since the last pass —
  // the fallback for users who are not polling while their ACH lands.
  const provisioning = await c.accountService.activatePendingAccounts();
  if (provisioning.checked > 0) {
    console.log(JSON.stringify({ msg: "provisioning sweep", ...provisioning }));
  }
  const result = await c.reconciliationService.reconcileAll();
  lastReconcileAt = new Date();
  // Heartbeat row: the web app's system-status endpoint derives pipeline
  // health from this (a fresh beat means order state is bounded-stale).
  await pgTransactionRunner.run((tx) =>
    streamCursorsRepository.set(tx, c.broker.kind, "reconcile-heartbeat", new Date().toISOString()),
  );
  return { ...(result as object), provisioning };
}

/**
 * Per-job health: last success, last error, and overdue = enabled and not
 * successful within 2× its interval (a tick or two can be missed safely).
 */
async function jobHealth() {
  const rows = new Map((await jobRunsRepository.list()).map((r) => [r.name, r]));
  return allJobs().map((job) => {
    const row = rows.get(job.name);
    const last = row?.lastSucceededAt?.getTime() ?? null;
    const enabled = job.enabled();
    return {
      name: job.name,
      enabled,
      lastSucceededAt: row?.lastSucceededAt?.toISOString() ?? null,
      lastError: row?.lastError ?? null,
      overdue: enabled && (last === null || Date.now() - last > 2 * job.intervalMs),
    };
  });
}

function main(): void {
  const { PORT, CRON_SECRET } = env();

  const server = http.createServer((req, res) => {
    const respond = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.url === "/healthz") {
      // Readiness = DB reachable; cursor/reconcile freshness and overdue
      // jobs degrade the status without failing it (DEPLOYMENT.md).
      void (async () => {
        const dbOk = await pgTransactionRunner.run(async () => true).catch(() => false);
        const lastActivity = Math.max(lastEventAt?.getTime() ?? 0, lastReconcileAt?.getTime() ?? 0);
        const staleMs = lastActivity ? Date.now() - lastActivity : null;
        const jobs = dbOk ? await jobHealth().catch(() => []) : [];
        const degraded =
          (!getContainer().deterministicBroker && (staleMs === null || staleMs > 30 * 60_000)) ||
          jobs.some((j) => j.overdue);
        respond(dbOk ? 200 : 503, {
          status: !dbOk ? "not-ready" : degraded ? "degraded" : "ok",
          role: "worker",
          db: dbOk,
          lastEventAt: lastEventAt?.toISOString() ?? null,
          lastReconcileAt: lastReconcileAt?.toISOString() ?? null,
          jobs,
        });
      })();
      return;
    }
    if (req.url === "/jobs/tick" && req.method === "POST") {
      if (!CRON_SECRET || !bearerMatches(req.headers.authorization, CRON_SECRET)) {
        respond(401, { status: "unauthorized" });
        return;
      }
      runDueJobs(allJobs())
        .then((outcomes) =>
          // 200 even when a job failed: the tick itself worked, and a non-2xx
          // would make the caller's retries re-run the failed job at once.
          // The workflow reads the statuses; /healthz shows the error.
          respond(200, {
            status: "ok",
            // names + statuses only: errors stay in the log, not on the wire
            jobs: outcomes.map((o) => ({ name: o.name, status: o.status })),
          }),
        )
        .catch((err) => {
          console.error(
            JSON.stringify({ level: "error", msg: "jobs tick failed", err: String(err) }),
          );
          respond(500, { status: "error" });
        });
      return;
    }
    if (req.url === "/reconcile" && req.method === "POST") {
      if (!CRON_SECRET || !bearerMatches(req.headers.authorization, CRON_SECRET)) {
        respond(401, { status: "unauthorized" });
        return;
      }
      runReconciliation()
        .then((result) => respond(200, { status: "ok", result }))
        .catch((err) => {
          // Details go to the log, not the wire (the caller only needs pass/fail).
          console.error(
            JSON.stringify({ level: "error", msg: "reconcile failed", err: String(err) }),
          );
          respond(500, { status: "error" });
        });
      return;
    }
    respond(404, { status: "not-found" });
  });

  server.listen(PORT, () => {
    console.log(JSON.stringify({ msg: "worker listening", port: PORT }));
  });

  // Graceful shutdown (Render sends SIGTERM on deploy/restart): stop taking
  // requests, close the event stream, drain the pool, then exit.
  const shutdown = (signal: string) => {
    console.log(JSON.stringify({ msg: "shutting down", signal }));
    subscription?.close();
    server.close(() => {
      void closeDb().finally(() => process.exit(0));
    });
    // Hard stop if a request or the pool refuses to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

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
    // due scheduled jobs run after the stream is up; a slept instance that
    // wakes for /reconcile catches up on them too
    .then(() => runDueJobs(allJobs()))
    .then((outcomes) =>
      console.log(
        JSON.stringify({
          msg: "startup jobs",
          outcomes: outcomes.map((o) => ({ name: o.name, status: o.status })),
        }),
      ),
    )
    .catch((err) =>
      console.error(JSON.stringify({ level: "error", msg: "stream startup", err: String(err) })),
    );
}

main();
