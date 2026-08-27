"use client";

/**
 * WeaveFill — an order's fill progress drawn in the loom's own grammar
 * (BRAND.md §4): warp hairlines at a fixed pitch, with one pick laid per
 * filled interval. Filled / partially filled / resting in a single figure.
 *
 * Semantic, never decorative: it renders only real filledQty/qty and is
 * aria-hidden — the adjacent "n/n" text remains the accessible carrier.
 * Colour: currentColor picks over token warp (laws 1–2: no accent on
 * numbers, no gain/loss on structure); inherits on-field inside .field-panel.
 * Motion: a newly laid pick snaps in with the reed's beat; replays and
 * re-renders never re-animate (keyed by pick index, animated only when the
 * index is above the count first seen for this order).
 */

import { useRef } from "react";

const INTERVALS = 10;
const W = 100; // viewBox units; rendered small (caption scale)
const H = 8;
const PITCH = W / INTERVALS;
const PICK_H = 3.6;
const GAP = 1.2; // breathing room around the warp where a pick is notched

export function WeaveFill({ filledQty, qty }: { filledQty: string; qty: string }) {
  const filled = Number(filledQty);
  const total = Number(qty);
  // First count seen for this mount: picks at or below it render settled.
  const settledRef = useRef(filled);
  if (!Number.isFinite(filled) || !Number.isFinite(total) || total <= 0) return null;

  const laid = Math.round((Math.min(filled, total) / total) * INTERVALS);

  return (
    <svg
      className="weave-fill"
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
      focusable="false"
      preserveAspectRatio="none"
    >
      {/* the warp: interval boundaries, held under tension */}
      {Array.from({ length: INTERVALS - 1 }, (_, i) => (
        <rect
          key={`w${i}`}
          className="weave-warp"
          x={(i + 1) * PITCH - 0.5}
          y={0}
          width={1}
          height={H}
        />
      ))}
      {/* the picks: one per filled interval, laid left to right */}
      {Array.from({ length: laid }, (_, i) => {
        const fresh = (i + 1) / INTERVALS > settledRef.current / total + 1e-9;
        return (
          <rect
            key={`p${i}`}
            className={fresh ? "weave-pick weave-pick-fresh" : "weave-pick"}
            x={i * PITCH + (i === 0 ? 0 : GAP / 2)}
            y={(H - PICK_H) / 2}
            width={PITCH - (i === 0 || i === laid - 1 ? GAP / 2 : GAP)}
            height={PICK_H}
          />
        );
      })}
    </svg>
  );
}
