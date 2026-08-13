import { sql } from "drizzle-orm";
import { getDb } from "@/infra/db";

// Readiness: critical internal dependencies only (the database). External
// provider status is deliberately excluded — see /api/v1/system/status.
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ready" });
  } catch {
    return Response.json({ status: "not-ready" }, { status: 503 });
  }
}
