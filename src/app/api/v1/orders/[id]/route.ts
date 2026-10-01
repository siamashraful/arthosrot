import { jsonResponse, pathParam, withAuth } from "@/server/api/http";
import { getOrderDetail } from "@/server/api/orders";

export const GET = withAuth(async (request, session) =>
  jsonResponse(await getOrderDetail(pathParam(request), session)),
);
