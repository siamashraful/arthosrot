import { jsonResponse, withAuth } from "@/server/api/http";
import { getBrowse } from "@/server/api/discovery";

export const GET = withAuth(async () => jsonResponse(await getBrowse()));
