import { jsonResponse, withAuth } from "@/server/api/http";
import { requestTransfer } from "@/server/api/cash";

export const POST = withAuth(async (request, session) => {
  const { body, status } = await requestTransfer(request, session);
  return jsonResponse(body, status);
});
