import { jsonResponse, withAuth } from "@/server/api/http";
import { cancelOrder } from "@/server/api/orders";

export const POST = withAuth(async (request, session) => {
  const segments = new URL(request.url).pathname.split("/");
  const id = decodeURIComponent(segments[segments.length - 2] ?? "");
  return jsonResponse(await cancelOrder(id, session));
});
