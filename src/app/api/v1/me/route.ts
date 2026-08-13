import { jsonResponse, withAuth } from "@/server/api/http";
import { getMe } from "@/server/api/portfolio";

export const GET = withAuth(async (_request, session) => jsonResponse(await getMe(session)));
