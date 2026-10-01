import { jsonResponse, withAuth } from "@/server/api/http";
import { getBrowseList } from "@/server/api/discovery";

export const GET = withAuth(async (request) => {
  const segments = new URL(request.url).pathname.split("/");
  const slug = decodeURIComponent(segments[segments.length - 1] ?? "");
  return jsonResponse(await getBrowseList(slug, request));
});
