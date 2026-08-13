import { describe, expect, it } from "vitest";
import { invariant, InvariantViolation } from "./invariant";

describe("invariant", () => {
  it("passes through when the condition holds", () => {
    expect(() => invariant(1 === 1, "must hold")).not.toThrow();
  });

  it("throws InvariantViolation with the message when the condition fails", () => {
    expect(() => invariant(false, "filled qty exceeded order qty")).toThrowError(
      new InvariantViolation("filled qty exceeded order qty"),
    );
  });
});
