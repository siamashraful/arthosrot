import { jsonResponse, withAuth } from "@/server/api/http";
import { getLedger } from "@/server/api/portfolio";

export const GET = withAuth(async (request, session) =>
  jsonResponse(await getLedger(request, session)),
);
