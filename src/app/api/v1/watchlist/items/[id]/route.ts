import { jsonResponse, pathParam, withAuth } from "@/server/api/http";
import { removeWatchlistItem } from "@/server/api/portfolio";

export const DELETE = withAuth(async (request, session) =>
  jsonResponse(await removeWatchlistItem(pathParam(request), session)),
);
