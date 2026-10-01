import { jsonResponse, pathParam, withAuth } from "@/server/api/http";
import { cancelOrder } from "@/server/api/orders";

export const POST = withAuth(async (request, session) =>
  jsonResponse(await cancelOrder(pathParam(request, 1), session)),
);
