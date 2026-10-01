"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons/Icon";

/**
 * Lifecycle tag covering all ten canonical states (EXECUTION.md) in the
 * system's status-tag language: icon plus word, never colour alone. Working
 * states are Pending (warning tint, clock); Filled is the gain tint with a
 * check; final non-fills are the cancelled tag with an x, and venue failures
 * carry a warning icon instead so a rejection reads differently from a
 * cancel even in greyscale.
 */
const TONE: Record<string, { cls: string; icon: IconName }> = {
  PENDING_SUBMISSION: { cls: "ar-tag--pending", icon: "clock" },
  ACKNOWLEDGED: { cls: "ar-tag--pending", icon: "clock" },
  ACCEPTED: { cls: "ar-tag--pending", icon: "clock" },
  PARTIALLY_FILLED: { cls: "ar-tag--pending", icon: "clock" },
  CANCEL_PENDING: { cls: "ar-tag--pending", icon: "clock" },
  FILLED: { cls: "ar-tag--filled", icon: "check" },
  CANCELLED: { cls: "ar-tag--cancelled", icon: "x" },
  EXPIRED: { cls: "ar-tag--cancelled", icon: "x" },
  REJECTED: { cls: "ar-tag--cancelled", icon: "alert" },
  SUBMIT_FAILED: { cls: "ar-tag--cancelled", icon: "alert" },
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
  const { cls, icon } = TONE[state] ?? { cls: "ar-tag--neutral", icon: "clock" };
  return (
    <span className={`badge ar-tag ${cls}${beat ? " badge-beat" : ""}`}>
      <Icon name={icon} size={12} stroke={2.25} />
      {display}
    </span>
  );
}
