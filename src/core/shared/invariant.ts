/**
 * Thrown when a domain invariant is violated. Invariant violations are bugs,
 * never expected control flow — they map to INTERNAL errors at the API layer
 * and error-level logs (docs/architecture/FINANCIAL_INVARIANTS.md).
 */
export class InvariantViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvariantViolation";
  }
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new InvariantViolation(message);
  }
}
