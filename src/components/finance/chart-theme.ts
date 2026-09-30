"use client";

import { useEffect, useState } from "react";

/**
 * Shared chart theming (CandleChart + NetWorthChart).
 *
 * lightweight-charts' color parser predates oklch()/lab(); normalize token
 * colors to rgba via a canvas round-trip before handing them over. This is
 * the sanctioned chart-rendering boundary (FINANCIAL_INVARIANTS.md): color
 * conversion only — never arithmetic on financial values.
 */
export function normalizeColor(color: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "#888888";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${((a ?? 255) / 255).toFixed(3)})`;
}

/**
 * Read chart tokens off an element, normalized for lightweight-charts. Takes
 * any map of `{ name: "--css-var" }` and returns the same keys resolved —
 * the LineChart pattern reads `--chart-line`, `--divider`, `--text-tertiary`
 * and both `--gain-tint` / `--loss-tint` (the area fill follows the period's
 * direction).
 */
export function chartTokens<K extends string>(
  el: HTMLElement,
  vars: Record<K, string>,
): Record<K, string> {
  const styles = getComputedStyle(el);
  const out = {} as Record<K, string>;
  for (const key of Object.keys(vars) as K[]) {
    out[key] = normalizeColor(styles.getPropertyValue(vars[key]).trim());
  }
  return out;
}

/**
 * Bumps whenever the effective theme OR trading mode changes (data-theme
 * toggle, the OS scheme under the "system" setting, data-mode flip) so chart
 * effects can re-read tokens — charts read computed colors once per render
 * and would otherwise keep the old paint.
 */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-mode"],
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", bump);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", bump);
    };
  }, []);
  return version;
}
