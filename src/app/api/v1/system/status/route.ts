import { getSystemStatus } from "@/server/api/health";
import { jsonResponse, withAuth } from "@/server/api/http";

/** Pipeline/provider health for the UI banner — see src/server/api/health.ts. */
export const GET = withAuth(async () => jsonResponse(await getSystemStatus()));
