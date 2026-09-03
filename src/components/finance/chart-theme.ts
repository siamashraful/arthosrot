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

/** Read chart tokens off an element, normalized for lightweight-charts. */
export function chartTokens(
  el: HTMLElement,
  vars: { line: string; fill: string; grid: string; text: string },
) {
  const styles = getComputedStyle(el);
  const get = (name: string) => normalizeColor(styles.getPropertyValue(name).trim());
  return { line: get(vars.line), fill: get(vars.fill), grid: get(vars.grid), text: get(vars.text) };
}

/**
 * Bumps whenever the effective theme changes (data-theme toggle or the OS
 * scheme under the "system" setting) so chart effects can re-read tokens —
 * charts read computed colors once per render and would otherwise keep the
 * old theme's paint.
 */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
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
