import { checkReady } from "@/server/api/health";

// Readiness: critical internal dependencies only (the database). External
// provider status is deliberately excluded — see /api/v1/system/status.
export async function GET() {
  return (await checkReady())
    ? Response.json({ status: "ready" })
    : Response.json({ status: "not-ready" }, { status: 503 });
}
