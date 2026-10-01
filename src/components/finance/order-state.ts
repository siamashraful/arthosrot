import type { IconName } from "@/components/icons/Icon";
import type { OrderState } from "@/lib/api";

/**
 * One home for how the UI reads an order's canonical lifecycle state
 * (docs/architecture/EXECUTION.md): which states are still working, which are
 * final, which still accept a cancel, and the status-tag / row-chip language
 * for each. Display only — the server's state machine is the authority.
 */

export const OPEN_ORDER_STATES: ReadonlySet<OrderState> = new Set([
  "PENDING_SUBMISSION",
  "ACKNOWLEDGED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "CANCEL_PENDING",
]);

export const TERMINAL_ORDER_STATES: ReadonlySet<OrderState> = new Set([
  "FILLED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
  "SUBMIT_FAILED",
]);

export function isOrderOpen(state: OrderState): boolean {
  return OPEN_ORDER_STATES.has(state);
}

export function isOrderTerminal(state: OrderState): boolean {
  return TERMINAL_ORDER_STATES.has(state);
}

/**
 * Orders the venue will still accept a cancel for: working orders, minus
 * one still being submitted (the server refuses that cancel) and one whose
 * cancel is already pending.
 */
export function isCancellable(state: OrderState): boolean {
  return isOrderOpen(state) && state !== "PENDING_SUBMISSION" && state !== "CANCEL_PENDING";
}

type Tone = "working" | "filled" | "failed" | "ended";

function toneOf(state: OrderState): Tone {
  if (state === "FILLED") return "filled";
  if (state === "REJECTED" || state === "SUBMIT_FAILED") return "failed";
  if (isOrderOpen(state)) return "working";
  return "ended"; // CANCELLED, EXPIRED
}

const TAG: Record<Tone, string> = {
  working: "ar-tag--pending",
  filled: "ar-tag--filled",
  failed: "ar-tag--cancelled",
  ended: "ar-tag--cancelled",
};

const CHIP: Record<Tone, string> = {
  working: "ar-chipicon--warning",
  filled: "ar-chipicon--gain",
  failed: "ar-chipicon--loss",
  ended: "ar-chipicon--neutral",
};

/** A failure carries the alert glyph so a rejection never reads as a cancel, even in greyscale. */
const ICON: Record<Tone, IconName> = {
  working: "clock",
  filled: "check",
  failed: "alert",
  ended: "x",
};

/** Status tag (icon + word, never colour alone) for an order state. */
export function orderStateTag(state: OrderState): { cls: string; icon: IconName } {
  const tone = toneOf(state);
  return { cls: TAG[tone], icon: ICON[tone] };
}

/** Row chip (orders list) for an order state. */
export function orderStateChip(state: OrderState): { cls: string; icon: IconName } {
  const tone = toneOf(state);
  return { cls: CHIP[tone], icon: ICON[tone] };
}

/** Row chip for a lifecycle EVENT on the order timeline, by what the event did. */
export function orderEventChip(type: string): { cls: string; icon: IconName } {
  const tone: Tone = type.includes("FILL")
    ? "filled"
    : type.includes("REJECT") || type.includes("FAIL")
      ? "failed"
      : type.includes("CANCEL") || type.includes("EXPIRE")
        ? "ended"
        : "working";
  return { cls: CHIP[tone], icon: ICON[tone] };
}

/** "PARTIALLY_FILLED" → "Partially filled": event codes read as words. */
export function humanizeCode(code: string): string {
  const words = code.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
