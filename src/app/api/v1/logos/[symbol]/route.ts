import { getLogo } from "@/server/api/logos";
import { errorResponse, pathParam } from "@/server/api/http";
import { getSession } from "@/server/session";

/** Authed image proxy — see src/server/api/logos.ts. Not JSON, so it wraps
 *  the auth guard manually instead of using withAuth's jsonResponse path. */
export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const session = await getSession(request.headers);
    if (!session) return new Response(null, { status: 401 });
    let symbol: string;
    try {
      symbol = pathParam(request);
    } catch {
      return new Response(null, { status: 404 }); // malformed path: a miss, like a bad symbol
    }
    return await getLogo(symbol);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
