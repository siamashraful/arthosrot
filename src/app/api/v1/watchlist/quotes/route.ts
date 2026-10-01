import { jsonResponse, withAuth } from "@/server/api/http";
import { getWatchlistQuotes } from "@/server/api/watchlist-quotes";

export const GET = withAuth(async (_request, session) =>
  jsonResponse(await getWatchlistQuotes(session)),
);
