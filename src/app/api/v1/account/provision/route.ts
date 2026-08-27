import { jsonResponse, withAuth } from "@/server/api/http";
import { provisionAccount } from "@/server/api/portfolio";

export const POST = withAuth(async (request, session) =>
  jsonResponse(await provisionAccount(request, session), 201),
);
