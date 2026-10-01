import { jsonResponse, pathParam, withAuth } from "@/server/api/http";
import { getInstrumentStats } from "@/server/api/key-stats";

export const GET = withAuth(async (request) =>
  jsonResponse(await getInstrumentStats(pathParam(request, 1))),
);
