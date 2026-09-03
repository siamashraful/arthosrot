import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/core/shared";
import { enforceRateLimit, resetRateLimitsForTests } from "./rate-limit";

describe("enforceRateLimit", () => {
  beforeEach(resetRateLimitsForTests);

  it("allows up to max in a window, then throws RATE_LIMITED (429)", () => {
    for (let i = 0; i < 5; i++) enforceRateLimit("k", 5, 60_000);
    try {
      enforceRateLimit("k", 5, 60_000);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("RATE_LIMITED");
      expect((err as AppError).httpStatus).toBe(429);
    }
  });

  it("keys are independent", () => {
    for (let i = 0; i < 5; i++) enforceRateLimit("a", 5, 60_000);
    expect(() => enforceRateLimit("b", 5, 60_000)).not.toThrow();
  });
});
