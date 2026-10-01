import { jobRunsRepository } from "@/infra/db/repositories/job-runs";

/**
 * Scheduled jobs, decoupled from whatever triggers them. A job declares HOW
 * OFTEN it should run; triggers (worker startup, POST /jobs/tick from the
 * hourly GitHub Actions cron, `pnpm jobs:run`) only ask "anything due?".
 * Changing a frequency is a config change, adding a job is one defineJob().
 *
 * Due ⇔ never succeeded, or last success ≥ interval ago. A failed run keeps
 * its old success time, so it's retried on the next tick. The lease stops
 * overlapping triggers running one job twice; it expires on its own if the
 * process dies mid-run.
 */

export interface JobDefinition {
  name: string;
  intervalMs: number;
  /** Upper bound on one run; the lease expires after it. */
  leaseMs: number;
  /** false ⇒ skipped (not failed) — e.g. missing config in dev/CI. */
  enabled: () => boolean;
  run: () => Promise<unknown>;
}

export function defineJob(
  def: Pick<JobDefinition, "name" | "intervalMs" | "run"> & Partial<JobDefinition>,
): JobDefinition {
  return { leaseMs: 15 * 60_000, enabled: () => true, ...def };
}

export type JobOutcome =
  | { name: string; status: "ran"; result: unknown }
  | { name: string; status: "failed"; error: string }
  | { name: string; status: "not-due" | "disabled" };

export interface JobRunStore {
  claim(name: string, opts: { now: Date; dueBefore: Date; leaseUntil: Date }): Promise<boolean>;
  succeed(name: string, at: Date): Promise<void>;
  fail(name: string, error: string): Promise<void>;
}

export async function runDueJobs(
  jobs: readonly JobDefinition[],
  opts: { now?: () => Date; store?: JobRunStore; force?: boolean } = {},
): Promise<JobOutcome[]> {
  const now = opts.now ?? (() => new Date());
  const store = opts.store ?? jobRunsRepository;
  const outcomes: JobOutcome[] = [];
  for (const job of jobs) {
    if (!job.enabled()) {
      outcomes.push({ name: job.name, status: "disabled" });
      continue;
    }
    const start = now();
    const claimed = await store.claim(job.name, {
      now: start,
      // force (manual runs) treats every job as due; the lease still applies
      dueBefore: opts.force ? start : new Date(start.getTime() - job.intervalMs),
      leaseUntil: new Date(start.getTime() + job.leaseMs),
    });
    if (!claimed) {
      outcomes.push({ name: job.name, status: "not-due" });
      continue;
    }
    try {
      const result = await job.run();
      await store.succeed(job.name, now());
      outcomes.push({ name: job.name, status: "ran", result });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await store.fail(job.name, error);
      console.error(JSON.stringify({ level: "error", msg: "job failed", job: job.name, error }));
      outcomes.push({ name: job.name, status: "failed", error });
    }
  }
  return outcomes;
}
