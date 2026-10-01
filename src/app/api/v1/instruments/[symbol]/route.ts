import { jsonResponse, pathParam, withAuth } from "@/server/api/http";
import { getInstrumentDetail } from "@/server/api/market";

export const GET = withAuth(async (request) =>
  jsonResponse(await getInstrumentDetail(pathParam(request))),
);
