import { jsonResponse, withAuth } from "@/server/api/http";
import { getUnreadCount } from "@/server/api/alerts";

export const GET = withAuth(async (_request, session) =>
  jsonResponse(await getUnreadCount(session)),
);
