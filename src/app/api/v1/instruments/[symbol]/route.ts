import { jsonResponse, withAuth } from "@/server/api/http";
import { getInstrumentDetail } from "@/server/api/market";

export const GET = withAuth(async (request) => {
  const segments = new URL(request.url).pathname.split("/");
  const symbol = decodeURIComponent(segments[segments.length - 1] ?? "");
  return jsonResponse(await getInstrumentDetail(symbol));
});
