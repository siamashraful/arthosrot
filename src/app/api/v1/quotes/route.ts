import { jsonResponse, withAuth } from "@/server/api/http";
import { getBatchQuotes } from "@/server/api/market";

export const GET = withAuth(async (request) => jsonResponse(await getBatchQuotes(request)));
