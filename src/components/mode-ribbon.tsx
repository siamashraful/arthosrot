"use client";

import { useTradingMode } from "./trading-mode";

/**
 * The persistent mode label — signal 3 of the three-way mode system
 * (BRAND.md §5), the only one that survives greyscale, low vision, and a
 * screenshot. Removing it is a review-blocking change (SECURITY.md control 5).
 *
 * The ribbon itself carries the other two signals in miniature: it sits on
 * the mode's field colour, and shows its warp only while the cloth is still
 * on the loom (paper). In live preview the label says PREVIEW plainly —
 * never "real money" while no real trading exists (honesty over the spec'd
 * final-state label).
 */
export function ModeRibbon() {
  const mode = useTradingMode();
  if (mode === "live") {
    return (
      <div className="mode-ribbon" role="note" aria-label="Live trading notice">
        <span>Live preview — real trading isn&apos;t available yet</span>
      </div>
    );
  }
  return (
    <div className="mode-ribbon" role="note" aria-label="Simulation notice">
      <span>Practice — simulated money</span>
    </div>
  );
}
