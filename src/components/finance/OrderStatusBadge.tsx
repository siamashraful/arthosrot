"use client";

import { Check, Clock, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Lifecycle tag covering all ten canonical states (EXECUTION.md) in the
 * system's status-tag language: icon plus word, never colour alone. Working
 * states are Pending (warning tint, clock); Filled is the gain tint with a
 * check; final non-fills are the cancelled tag with an x, and venue failures
 * carry a warning icon instead so a rejection reads differently from a
 * cancel even in greyscale.
 */
const TONE: Record<string, { cls: string; Icon: typeof Check }> = {
  PENDING_SUBMISSION: { cls: "ar-tag--pending", Icon: Clock },
  ACKNOWLEDGED: { cls: "ar-tag--pending", Icon: Clock },
  ACCEPTED: { cls: "ar-tag--pending", Icon: Clock },
  PARTIALLY_FILLED: { cls: "ar-tag--pending", Icon: Clock },
  CANCEL_PENDING: { cls: "ar-tag--pending", Icon: Clock },
  FILLED: { cls: "ar-tag--filled", Icon: Check },
  CANCELLED: { cls: "ar-tag--cancelled", Icon: X },
  EXPIRED: { cls: "ar-tag--cancelled", Icon: X },
  REJECTED: { cls: "ar-tag--cancelled", Icon: TriangleAlert },
  SUBMIT_FAILED: { cls: "ar-tag--cancelled", Icon: TriangleAlert },
};

export function OrderStatusBadge({ state, display }: { state: string; display: string }) {
  // The pulse plays on STATE CHANGES only — never on mount, so a
  // 50-row history page loads still instead of bouncing (BRAND.md §3: no
  // entrance animation on data). A ref distinguishes transition from mount.
  const prev = useRef(state);
  const [beat, setBeat] = useState(false);
  useEffect(() => {
    if (prev.current === state) return;
    prev.current = state;
    setBeat(true);
    const t = setTimeout(() => setBeat(false), 300);
    return () => clearTimeout(t);
  }, [state]);
  const { cls, Icon } = TONE[state] ?? { cls: "ar-tag--neutral", Icon: Clock };
  return (
    <span className={`badge ar-tag ${cls}${beat ? " badge-beat" : ""}`}>
      <Icon className="ar-icon" size={12} strokeWidth={2.25} aria-hidden />
      {display}
    </span>
  );
}
