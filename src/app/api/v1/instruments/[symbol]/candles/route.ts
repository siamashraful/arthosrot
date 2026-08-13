import { jsonResponse, withAuth } from "@/server/api/http";
import { getInstrumentCandles } from "@/server/api/market";

export const GET = withAuth(async (request) => {
  const url = new URL(request.url);
  const segments = url.pathname.split("/");
  const symbol = decodeURIComponent(segments[segments.length - 2] ?? "");
  const range = url.searchParams.get("range") ?? "1M";
  return jsonResponse(await getInstrumentCandles(symbol, range));
});
