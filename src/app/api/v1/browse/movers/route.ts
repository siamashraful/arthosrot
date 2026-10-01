import { jsonResponse, withAuth } from "@/server/api/http";
import { getMovers } from "@/server/api/movers";

export const GET = withAuth(async () => jsonResponse(await getMovers()));
