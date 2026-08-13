/**
 * Application-wide error model (blueprint §41). API handlers map AppError to
 * the HTTP envelope {error: {code, subcode?, message, details?, requestId}}.
 */

export type ErrorCode =
  | "VALIDATION"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "DOMAIN_RULE"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "CONFLICT"
  | "INTERNAL";

export type DomainSubcode =
  | "INSUFFICIENT_BUYING_POWER"
  | "INSUFFICIENT_HOLDINGS"
  | "INVALID_QUANTITY"
  | "INVALID_LIMIT_PRICE"
  | "UNKNOWN_SYMBOL"
  | "MARKET_CLOSED"
  | "STALE_QUOTE"
  | "INVALID_STATE_TRANSITION"
  | "ORDER_NOT_CANCELLABLE"
  | "ACCOUNT_NOT_ACTIVE";

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 422,
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DOMAIN_RULE: 422,
  PROVIDER_UNAVAILABLE: 502,
  PROVIDER_TIMEOUT: 504,
  CONFLICT: 409,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly subcode?: DomainSubcode;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    opts: { subcode?: DomainSubcode; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.subcode = opts.subcode;
    this.details = opts.details;
  }

  get httpStatus(): number {
    return ERROR_HTTP_STATUS[this.code];
  }
}
