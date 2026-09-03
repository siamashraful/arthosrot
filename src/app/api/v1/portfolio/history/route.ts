import { jsonResponse, withAuth } from "@/server/api/http";
import { getPortfolioHistory } from "@/server/api/portfolio";

export const GET = withAuth(async (request, session) =>
  jsonResponse(await getPortfolioHistory(request, session)),
);
