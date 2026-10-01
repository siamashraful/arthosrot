import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "..";

export type JobRunRow = typeof schema.jobRuns.$inferSelect;

/**
 * Scheduled-job bookkeeping (src/worker/jobs/registry.ts). `claim` is the
 * whole concurrency story: one atomic upsert that only succeeds when the job
 * is due AND nobody holds its lease — two overlapping ticks can't both win.
 */
export const jobRunsRepository = {
  async claim(
    name: string,
    opts: { now: Date; dueBefore: Date; leaseUntil: Date },
  ): Promise<boolean> {
    const { now, dueBefore, leaseUntil } = opts;
    const rows = await getDb()
      .insert(schema.jobRuns)
      .values({ name, lastStartedAt: now, leaseUntil })
      .onConflictDoUpdate({
        target: schema.jobRuns.name,
        set: { lastStartedAt: now, leaseUntil },
        setWhere: sql`(${schema.jobRuns.leaseUntil} IS NULL OR ${schema.jobRuns.leaseUntil} < ${now})
          AND (${schema.jobRuns.lastSucceededAt} IS NULL OR ${schema.jobRuns.lastSucceededAt} <= ${dueBefore})`,
      })
      .returning({ name: schema.jobRuns.name });
    return rows.length === 1;
  },

  async succeed(name: string, at: Date): Promise<void> {
    await getDb()
      .update(schema.jobRuns)
      .set({ lastSucceededAt: at, lastError: null, leaseUntil: null })
      .where(eq(schema.jobRuns.name, name));
  },

  async fail(name: string, error: string): Promise<void> {
    await getDb()
      .update(schema.jobRuns)
      .set({ lastError: error.slice(0, 2000), leaseUntil: null })
      .where(eq(schema.jobRuns.name, name));
  },

  async list(): Promise<JobRunRow[]> {
    return getDb().select().from(schema.jobRuns);
  },
};
