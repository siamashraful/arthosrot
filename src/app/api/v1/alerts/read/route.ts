import { jsonResponse, withAuth } from "@/server/api/http";
import { markAlertsRead } from "@/server/api/alerts";

export const POST = withAuth(async (request, session) =>
  jsonResponse(await markAlertsRead(request, session)),
);
