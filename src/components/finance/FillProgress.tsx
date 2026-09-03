"use client";

/**
 * FillProgress — an order's fill progress as a plain track + bar.
 *
 * Semantic, never decorative: it renders only real filledQty/qty and is
 * aria-hidden — the adjacent "n/n" text remains the accessible carrier.
 * Colour comes from the .fill-progress CSS (ink on surfaces, on-hero inside
 * .hero-card); never gain/loss (structure is not a verdict). No motion on
 * fill — a fill is a fact, not a celebration.
 *
 * The percentage is a display number at the rendering boundary: no money
 * arithmetic happens here, so Number() on the DTO strings is acceptable.
 */

/** Integer 0–100 for a fill count; over-fill clamps, qty 0 renders empty. */
export function fillPercent(filled: number, qty: number): number {
  if (!Number.isFinite(filled) || !Number.isFinite(qty) || qty <= 0 || filled <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (filled / qty) * 100)));
}

export function FillProgress({ filledQty, qty }: { filledQty: string; qty: string }) {
  const pct = fillPercent(Number(filledQty), Number(qty));
  return (
    <span className="fill-progress" aria-hidden>
      <span
        className="fill-progress-bar"
        style={{ "--fill-pct": `${pct}%` } as React.CSSProperties}
      />
    </span>
  );
}
