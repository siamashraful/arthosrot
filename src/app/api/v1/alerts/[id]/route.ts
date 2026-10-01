import { jsonResponse, pathParam, withAuth } from "@/server/api/http";
import { deleteAlert } from "@/server/api/alerts";

export const DELETE = withAuth(async (request, session) =>
  jsonResponse(await deleteAlert(pathParam(request), session)),
);
