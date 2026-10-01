import { jsonResponse, withAuth } from "@/server/api/http";
import { getInstrumentStats } from "@/server/api/key-stats";

export const GET = withAuth(async (request) => {
  const segments = new URL(request.url).pathname.split("/");
  const symbol = decodeURIComponent(segments[segments.length - 2] ?? "");
  return jsonResponse(await getInstrumentStats(symbol));
});
