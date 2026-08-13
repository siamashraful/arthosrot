import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

// getAuth() is resolved per-request (not at module scope) so the build can
// collect route configuration without a configured environment.
export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
