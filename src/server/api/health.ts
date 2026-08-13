import { sql } from "drizzle-orm";
import { getDb } from "@/infra/db";

/** Readiness: critical internal dependencies only (DEPLOYMENT.md). */
export async function checkReady(): Promise<boolean> {
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
