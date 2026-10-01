import { jsonResponse, withAuth } from "@/server/api/http";
import { getCash } from "@/server/api/cash";

export const GET = withAuth(async (_request, session) => jsonResponse(await getCash(session)));
