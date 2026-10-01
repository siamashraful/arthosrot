import { NextResponse, type NextRequest } from "next/server";
import { PATHNAME_HEADER } from "@/lib/return-path";

/**
 * Hands the requested in-app path to server layouts, which can't otherwise
 * see it: the (app) layout's signed-out redirect carries it to /signin as
 * `?next=` ("Auth required → redirect to signin preserving return path",
 * docs/design/UX_PATTERNS.md). No auth decision is made here — the layout's
 * getSession() check stays the authority. The header is always overwritten,
 * so a client-supplied value never reaches the app, and the sign-in page
 * still sanitises it (src/lib/return-path.ts).
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Pages only: not the API, Next internals, or files with an extension.
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
