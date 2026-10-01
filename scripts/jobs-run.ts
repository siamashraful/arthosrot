import { closeDb } from "../src/infra/db";
import { allJobs, runDueJobs } from "../src/worker/jobs";

/**
 * Run scheduled jobs by hand: `pnpm jobs:run` runs whatever is due;
 * `pnpm jobs:run top-100-market-cap --force` runs one now regardless of its
 * interval (the lease still prevents overlapping a running instance).
 * Needs the same env as the worker (DATABASE_URL, provider keys, SEC_USER_AGENT).
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const names = args.filter((a) => !a.startsWith("--"));
  const jobs = allJobs().filter((j) => names.length === 0 || names.includes(j.name));
  if (jobs.length === 0) throw new Error(`no such job: ${names.join(", ")}`);
  const outcomes = await runDueJobs(jobs, { force });
  console.log(JSON.stringify(outcomes, null, 2));
  await closeDb();
  if (outcomes.some((o) => o.status === "failed")) process.exitCode = 1;
}

void main();
