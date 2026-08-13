import { AppError } from "../shared";
import { TERMINAL_STATES, type CanonicalEventType, type OrderState } from "./types";

/**
 * The canonical order state machine (docs/architecture/EXECUTION.md).
 * The single authority on transitions — enforced here in the domain, NOT in DB
 * triggers (revision decision; DB keeps structural constraints only).
 */

/** Target state implied by each event type (UNKNOWN_VENDOR_STATUS implies none). */
const EVENT_TARGET: Record<Exclude<CanonicalEventType, "UNKNOWN_VENDOR_STATUS">, OrderState> = {
  ORDER_ACKNOWLEDGED: "ACKNOWLEDGED",
  ORDER_ACCEPTED: "ACCEPTED",
  ORDER_PARTIALLY_FILLED: "PARTIALLY_FILLED",
  ORDER_FILLED: "FILLED",
  ORDER_CANCEL_PENDING: "CANCEL_PENDING",
  ORDER_CANCELLED: "CANCELLED",
  ORDER_REJECTED: "REJECTED",
  ORDER_EXPIRED: "EXPIRED",
  ORDER_SUBMIT_FAILED: "SUBMIT_FAILED",
};

/** Legal direct transitions (the §21 table). */
const LEGAL: Record<OrderState, ReadonlySet<OrderState>> = {
  PENDING_SUBMISSION: new Set([
    "ACKNOWLEDGED",
    "ACCEPTED",
    "PARTIALLY_FILLED",
    "FILLED",
    "REJECTED",
    "SUBMIT_FAILED",
  ]),
  ACKNOWLEDGED: new Set([
    "ACCEPTED",
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCEL_PENDING",
    "CANCELLED",
    "REJECTED",
    "EXPIRED",
  ]),
  ACCEPTED: new Set([
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCEL_PENDING",
    "CANCELLED",
    "REJECTED",
    "EXPIRED",
  ]),
  PARTIALLY_FILLED: new Set([
    "PARTIALLY_FILLED", // further fills
    "FILLED",
    "CANCEL_PENDING",
    "CANCELLED", // remainder cancelled; prior fills stand
    "EXPIRED", // remainder expired
  ]),
  CANCEL_PENDING: new Set([
    "PARTIALLY_FILLED", // race: fill won
    "FILLED", // race: fill won
    "CANCELLED",
    "EXPIRED",
  ]),
  FILLED: new Set(),
  CANCELLED: new Set(),
  REJECTED: new Set(),
  EXPIRED: new Set(),
  SUBMIT_FAILED: new Set(),
};

export interface TransitionStep {
  from: OrderState;
  to: OrderState;
  /** true = synthesized to absorb an out-of-order event (source='inferred'). */
  inferred: boolean;
}

export class InvalidTransitionError extends AppError {
  constructor(from: OrderState, eventType: CanonicalEventType) {
    super("DOMAIN_RULE", `illegal order transition: ${from} on ${eventType}`, {
      subcode: "INVALID_STATE_TRANSITION",
    });
    this.name = "InvalidTransitionError";
  }
}

export function isTerminal(state: OrderState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Plan the transition steps for an event arriving while the order is in
 * `current`. Out-of-order tolerance: a fill arriving before acknowledgement
 * synthesizes the implied ACKNOWLEDGED/ACCEPTED steps (recorded with
 * source='inferred') so the system converges to broker truth without
 * corrupting audit history. Terminal states admit no transitions — the caller
 * must treat InvalidTransitionError from a terminal state as
 * "log + keep audit row + no state change".
 */
export function planTransitions(
  current: OrderState,
  eventType: CanonicalEventType,
): TransitionStep[] {
  if (eventType === "UNKNOWN_VENDOR_STATUS") return []; // audit-only, never transitions

  const target = EVENT_TARGET[eventType];

  // Vendor streams echo statuses (e.g. a pending_cancel event after our own
  // local CANCEL_PENDING). A non-fill event targeting the current state is an
  // idempotent no-op: audited, no transition.
  const isFillEvent = eventType === "ORDER_PARTIALLY_FILLED" || eventType === "ORDER_FILLED";
  if (target === current && !isFillEvent) return [];

  // Out-of-order fill synthesis takes precedence over the direct edge so the
  // audit trail records the inferred acceptance the venue implicitly performed.
  const isFill = eventType === "ORDER_PARTIALLY_FILLED" || eventType === "ORDER_FILLED";
  if (isFill && (current === "PENDING_SUBMISSION" || current === "ACKNOWLEDGED")) {
    return [
      { from: current, to: "ACCEPTED", inferred: true },
      { from: "ACCEPTED", to: target, inferred: false },
    ];
  }

  if (LEGAL[current].has(target)) {
    return [{ from: current, to: target, inferred: false }];
  }

  throw new InvalidTransitionError(current, eventType);
}
