import { jsonResponse, withAuth } from "@/server/api/http";
import { removeWatchlistItem } from "@/server/api/portfolio";

export const DELETE = withAuth(async (request, session) => {
  const segments = new URL(request.url).pathname.split("/");
  const id = decodeURIComponent(segments[segments.length - 1] ?? "");
  return jsonResponse(await removeWatchlistItem(id, session));
});
