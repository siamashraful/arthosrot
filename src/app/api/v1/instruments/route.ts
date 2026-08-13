import { jsonResponse, withAuth } from "@/server/api/http";
import { searchInstruments } from "@/server/api/market";

export const GET = withAuth(async (request) => jsonResponse(await searchInstruments(request)));
