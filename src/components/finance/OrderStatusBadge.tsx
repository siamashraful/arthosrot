"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import type { OrderState } from "@/lib/api";
import { orderStateTag } from "./order-state";

/**
 * Lifecycle tag covering all ten canonical states (EXECUTION.md) in the
 * system's status-tag language: icon plus word, never colour alone. Working
 * states are Pending (warning tint, clock); Filled is the gain tint with a
 * check; final non-fills are the cancelled tag with an x, and venue failures
 * carry a warning icon instead so a rejection reads differently from a
 * cancel even in greyscale (mapping in ./order-state.ts).
 */
export function OrderStatusBadge({ state, display }: { state: OrderState; display: string }) {
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
  const { cls, icon } = orderStateTag(state);
  return (
    <span className={`ar-tag ${cls}${beat ? " ar-tag--beat" : ""}`}>
      <Icon name={icon} size={12} stroke={2.25} />
      {display}
    </span>
  );
}
