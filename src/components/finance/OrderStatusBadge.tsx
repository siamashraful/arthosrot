"use client";

import { useEffect, useRef, useState } from "react";

/** Lifecycle badge covering all ten canonical states (EXECUTION.md). */
const TONE: Record<string, string> = {
  PENDING_SUBMISSION: "badge",
  ACKNOWLEDGED: "badge badge-accent",
  ACCEPTED: "badge badge-accent",
  PARTIALLY_FILLED: "badge badge-accent",
  FILLED: "badge badge-gain",
  CANCEL_PENDING: "badge badge-warning",
  CANCELLED: "badge",
  REJECTED: "badge badge-loss",
  EXPIRED: "badge",
  SUBMIT_FAILED: "badge badge-loss",
};

export function OrderStatusBadge({ state, display }: { state: string; display: string }) {
  // The pulse plays on STATE CHANGES only — never on mount, so a
  // 50-row history page loads still instead of bouncing (BRAND.md §8: no
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
  return <span className={`${TONE[state] ?? "badge"}${beat ? " badge-beat" : ""}`}>{display}</span>;
}
