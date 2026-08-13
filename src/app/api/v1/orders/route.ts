import { jsonResponse, withAuth } from "@/server/api/http";
import { listOrders, placeOrder } from "@/server/api/orders";

export const GET = withAuth(async (request, session) =>
  jsonResponse(await listOrders(request, session)),
);

export const POST = withAuth(async (request, session) => {
  const { body, status } = await placeOrder(request, session);
  return jsonResponse(body, status);
});
