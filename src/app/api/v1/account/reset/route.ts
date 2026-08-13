import { jsonResponse, withAuth } from "@/server/api/http";
import { resetAccount } from "@/server/api/portfolio";

export const POST = withAuth(async (request, session) =>
  jsonResponse(await resetAccount(request, session)),
);
