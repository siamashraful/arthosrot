import { jsonResponse, withAuth } from "@/server/api/http";
import { createAlert, listAlerts } from "@/server/api/alerts";

export const GET = withAuth(async (_request, session) => jsonResponse(await listAlerts(session)));

export const POST = withAuth(async (request, session) => {
  const { body, status } = await createAlert(request, session);
  return jsonResponse(body, status);
});
