import { describe, expect, it } from "vitest";
import { InvalidTransitionError, isTerminal, planTransitions } from "./state-machine";
import { TERMINAL_STATES, type CanonicalEventType, type OrderState } from "./types";

const ALL_STATES: OrderState[] = [
  "PENDING_SUBMISSION",
  "ACKNOWLEDGED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCEL_PENDING",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
  "SUBMIT_FAILED",
];

const ALL_EVENTS: CanonicalEventType[] = [
  "ORDER_ACKNOWLEDGED",
  "ORDER_ACCEPTED",
  "ORDER_PARTIALLY_FILLED",
  "ORDER_FILLED",
  "ORDER_CANCEL_PENDING",
  "ORDER_CANCELLED",
  "ORDER_REJECTED",
  "ORDER_EXPIRED",
  "ORDER_SUBMIT_FAILED",
];

/**
 * The full legality matrix (docs/architecture/EXECUTION.md §state table),
 * exhaustively asserted: every (state, event) pair is either legal with the
 * expected final state, or must throw InvalidTransitionError.
 */
const EXPECTED: Record<OrderState, Partial<Record<CanonicalEventType, OrderState>>> = {
  PENDING_SUBMISSION: {
    ORDER_ACKNOWLEDGED: "ACKNOWLEDGED",
    ORDER_ACCEPTED: "ACCEPTED",
    ORDER_PARTIALLY_FILLED: "PARTIALLY_FILLED", // via inferred ACCEPTED
    ORDER_FILLED: "FILLED", // via inferred ACCEPTED
    ORDER_REJECTED: "REJECTED",
    ORDER_SUBMIT_FAILED: "SUBMIT_FAILED",
  },
  ACKNOWLEDGED: {
    ORDER_ACCEPTED: "ACCEPTED",
    ORDER_PARTIALLY_FILLED: "PARTIALLY_FILLED",
    ORDER_FILLED: "FILLED",
    ORDER_CANCEL_PENDING: "CANCEL_PENDING",
    ORDER_CANCELLED: "CANCELLED",
    ORDER_REJECTED: "REJECTED",
    ORDER_EXPIRED: "EXPIRED",
  },
  ACCEPTED: {
    ORDER_PARTIALLY_FILLED: "PARTIALLY_FILLED",
    ORDER_FILLED: "FILLED",
    ORDER_CANCEL_PENDING: "CANCEL_PENDING",
    ORDER_CANCELLED: "CANCELLED",
    ORDER_REJECTED: "REJECTED",
    ORDER_EXPIRED: "EXPIRED",
  },
  PARTIALLY_FILLED: {
    ORDER_PARTIALLY_FILLED: "PARTIALLY_FILLED",
    ORDER_FILLED: "FILLED",
    ORDER_CANCEL_PENDING: "CANCEL_PENDING",
    ORDER_CANCELLED: "CANCELLED",
    ORDER_EXPIRED: "EXPIRED",
  },
  CANCEL_PENDING: {
    ORDER_PARTIALLY_FILLED: "PARTIALLY_FILLED",
    ORDER_FILLED: "FILLED",
    ORDER_CANCELLED: "CANCELLED",
    ORDER_EXPIRED: "EXPIRED",
  },
  FILLED: {},
  CANCELLED: {},
  REJECTED: {},
  EXPIRED: {},
  SUBMIT_FAILED: {},
};

/** Non-fill events targeting the current state are idempotent vendor echoes. */
const EVENT_TARGET_FOR_ECHO: Partial<Record<CanonicalEventType, OrderState>> = {
  ORDER_ACKNOWLEDGED: "ACKNOWLEDGED",
  ORDER_ACCEPTED: "ACCEPTED",
  ORDER_CANCEL_PENDING: "CANCEL_PENDING",
  ORDER_CANCELLED: "CANCELLED",
  ORDER_REJECTED: "REJECTED",
  ORDER_EXPIRED: "EXPIRED",
  ORDER_SUBMIT_FAILED: "SUBMIT_FAILED",
};

function isEcho(state: OrderState, event: CanonicalEventType): boolean {
  return EVENT_TARGET_FOR_ECHO[event] === state;
}

describe("order state machine (exhaustive, invariant 2)", () => {
  for (const state of ALL_STATES) {
    for (const event of ALL_EVENTS) {
      const expected = EXPECTED[state][event];
      if (isEcho(state, event)) {
        it(`${state} + ${event} is an idempotent echo (no-op)`, () => {
          expect(planTransitions(state, event)).toEqual([]);
        });
      } else if (expected) {
        it(`${state} + ${event} -> ${expected}`, () => {
          const steps = planTransitions(state, event);
          expect(steps.at(-1)!.to).toBe(expected);
          expect(steps[0]!.from).toBe(state);
          // Steps chain contiguously.
          for (let i = 1; i < steps.length; i++) {
            expect(steps[i]!.from).toBe(steps[i - 1]!.to);
          }
        });
      } else {
        it(`${state} + ${event} is illegal`, () => {
          expect(() => planTransitions(state, event)).toThrow(InvalidTransitionError);
        });
      }
    }
  }

  it("terminal states admit no transitions (echoes no-op; everything else throws)", () => {
    for (const state of TERMINAL_STATES) {
      expect(isTerminal(state)).toBe(true);
      for (const event of ALL_EVENTS) {
        if (isEcho(state, event)) {
          expect(planTransitions(state, event)).toEqual([]);
        } else {
          expect(() => planTransitions(state, event)).toThrow(InvalidTransitionError);
        }
      }
    }
  });

  it("fills before acceptance synthesize the inferred ACCEPTED step", () => {
    const steps = planTransitions("PENDING_SUBMISSION", "ORDER_FILLED");
    expect(steps).toEqual([
      { from: "PENDING_SUBMISSION", to: "ACCEPTED", inferred: true },
      { from: "ACCEPTED", to: "FILLED", inferred: false },
    ]);
    const partial = planTransitions("ACKNOWLEDGED", "ORDER_PARTIALLY_FILLED");
    expect(partial[0]).toEqual({ from: "ACKNOWLEDGED", to: "ACCEPTED", inferred: true });
  });

  it("UNKNOWN_VENDOR_STATUS never transitions (audit-only policy)", () => {
    for (const state of ALL_STATES) {
      expect(planTransitions(state, "UNKNOWN_VENDOR_STATUS")).toEqual([]);
    }
  });
});
