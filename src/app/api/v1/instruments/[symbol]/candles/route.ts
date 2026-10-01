import { jsonResponse, pathParam, withAuth } from "@/server/api/http";
import { getInstrumentCandles } from "@/server/api/market";

export const GET = withAuth(async (request) => {
  const range = new URL(request.url).searchParams.get("range") ?? "1M";
  return jsonResponse(await getInstrumentCandles(pathParam(request, 1), range));
});
