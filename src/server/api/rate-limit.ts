import { AppError } from "@/core/shared";

/**
 * Minimal fixed-window rate limiter for hot mutation endpoints (SECURITY.md).
 * In-memory, so on serverless it bounds abuse PER INSTANCE — a burst brake,
 * not a distributed quota. A shared store (e.g. Postgres or Redis) is the
 * upgrade path if per-instance limits ever prove insufficient; the financial
 * invariants (idempotency keys, buying-power reservations) are the primary
 * abuse bound either way.
 */

const windows = new Map<string, { windowStart: number; count: number }>();
const MAX_TRACKED_KEYS = 10_000;

export function enforceRateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  if (windows.size > MAX_TRACKED_KEYS) {
    for (const [k, v] of windows) {
      if (now - v.windowStart >= windowMs) windows.delete(k);
    }
  }
  const entry = windows.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    windows.set(key, { windowStart: now, count: 1 });
    return;
  }
  entry.count += 1;
  if (entry.count > max) {
    throw new AppError("RATE_LIMITED", "Too many requests — slow down and try again shortly");
  }
}

/** Test-only: clear all windows. */
export function resetRateLimitsForTests(): void {
  windows.clear();
}
