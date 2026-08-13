import { jsonResponse, withAuth } from "@/server/api/http";
import { getPortfolio } from "@/server/api/portfolio";

export const GET = withAuth(async (_request, session) => jsonResponse(await getPortfolio(session)));
