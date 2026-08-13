import { jsonResponse, withAuth } from "@/server/api/http";
import { addWatchlistItem, getWatchlist } from "@/server/api/portfolio";

export const GET = withAuth(async (_request, session) => jsonResponse(await getWatchlist(session)));

export const POST = withAuth(async (request, session) =>
  jsonResponse(await addWatchlistItem(request, session), 201),
);
