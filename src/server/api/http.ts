import { ZodError } from "zod";
import { ProviderUnavailableError, UnknownSymbolError } from "@/core/market-data";
import { AppError } from "@/core/shared";
import { getSession, type SessionInfo } from "../session";

/**
 * HTTP plumbing for /api/v1: the error envelope
 * {error: {code, subcode?, message, details?, requestId}} and the auth guard.
 */

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return new AppError("VALIDATION", "Invalid request", { details: err.flatten() });
  }
  if (err instanceof UnknownSymbolError) {
    return new AppError("NOT_FOUND", err.message, { subcode: "UNKNOWN_SYMBOL" });
  }
  if (err instanceof ProviderUnavailableError) {
    return new AppError("PROVIDER_UNAVAILABLE", "Market data is temporarily unavailable", {
      cause: err,
    });
  }
  return new AppError("INTERNAL", "Something went wrong", { cause: err });
}

export function errorResponse(err: unknown, requestId: string): Response {
  const appError = toAppError(err);
  if (appError.code === "INTERNAL") {
    console.error(
      JSON.stringify({ level: "error", requestId, err: String(appError.cause ?? appError) }),
    );
  }
  const res = jsonResponse(
    {
      error: {
        code: appError.code,
        ...(appError.subcode ? { subcode: appError.subcode } : {}),
        message: appError.message,
        ...(appError.details !== undefined ? { details: appError.details } : {}),
        requestId,
      },
    },
    appError.httpStatus,
  );
  // Correlation without a body parse — support/debugging reads it off the wire.
  res.headers.set("x-request-id", requestId);
  return res;
}

type AuthedHandler = (request: Request, session: SessionInfo) => Promise<Response>;

/** Auth-guarded handler with the standard envelope on every failure path. */
export function withAuth(handler: AuthedHandler): (request: Request) => Promise<Response> {
  return async (request) => {
    const requestId = crypto.randomUUID();
    try {
      const session = await getSession(request.headers);
      if (!session) {
        throw new AppError("AUTH_REQUIRED", "Sign in to continue");
      }
      return await handler(request, session);
    } catch (err) {
      return errorResponse(err, requestId);
    }
  };
}
