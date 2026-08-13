import { jsonResponse, withAuth } from "@/server/api/http";
import { getOrderDetail } from "@/server/api/orders";

export const GET = withAuth(async (request, session) => {
  const segments = new URL(request.url).pathname.split("/");
  const id = decodeURIComponent(segments[segments.length - 1] ?? "");
  return jsonResponse(await getOrderDetail(id, session));
});
