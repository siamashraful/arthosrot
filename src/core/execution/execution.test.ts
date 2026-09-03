import { afterEach, describe, expect, it, vi } from "vitest";
import { InvariantViolation } from "../shared";
import { ExecutionService } from "./execution";

/**
 * Paper/live isolation control 3 (SECURITY.md): ExecutionService refuses any
 * broker whose kind is not a paper kind. The BrokerKindId type already
 * forbids this at compile time; the runtime guard is defense in depth against
 * a future widening of the union.
 */

function construct(kind: string): ExecutionService {
  return new ExecutionService(
    { kind } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe("ExecutionService paper-kind guard", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["DETERMINISTIC", "ALPACA_PAPER"])("accepts paper kind %s", (kind) => {
    expect(() => construct(kind)).not.toThrow();
  });

  it("rejects a non-paper kind with an alert-level log", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => construct("ALPACA_LIVE")).toThrow(InvariantViolation);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"level":"alert"'));
  });
});
