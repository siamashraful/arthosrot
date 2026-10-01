import { jsonResponse, pathParam, withAuth } from "@/server/api/http";
import { getBrowseList } from "@/server/api/discovery";

export const GET = withAuth(async (request) =>
  jsonResponse(await getBrowseList(pathParam(request), request)),
);
