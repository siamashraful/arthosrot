"use client";

import {
  LineStyle,
  type ChartOptions,
  type DeepPartial,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

/**
 * The scrub-chart pattern shared by the price chart and the net-worth chart —
 * the interaction the leading brokerage apps converged on: the chart is a
 * FIXED picture of the selected range (no pan, no pinch/wheel zoom — the
 * range pills are the only way to change the window), and dragging a finger
 * or pointer across it reads out the bar underneath: its value, its change
 * since the start of the range, and its date/time at the range's resolution.
 */

/** Options that make a chart a fixed, scrub-only picture of its data. */
export function scrubChartOptions(t: { text: string; grid: string }): DeepPartial<ChartOptions> {
  return {
    autoSize: true,
    layout: { background: { color: "transparent" }, textColor: t.text, attributionLogo: false },
    // No pan, no zoom: dragging used to scroll the series off the card and
    // wheel/pinch stretched it. The range pills own the window.
    handleScroll: false,
    handleScale: false,
    kineticScroll: { mouse: false, touch: false },
    timeScale: {
      borderVisible: false,
      fixLeftEdge: true,
      fixRightEdge: true,
      lockVisibleTimeRangeOnResize: true,
    },
    crosshair: {
      // one vertical hairline; the value and time live in the readouts, not
      // in axis flags a finger would cover
      vertLine: { color: t.grid, width: 1, style: LineStyle.Solid, labelVisible: false },
      horzLine: { visible: false, labelVisible: false },
    },
  };
}

interface ScrubTarget {
  /** Number of plotted points (index-aligned with the series data). */
  count: () => number;
  /** Plotted value + time of point i. */
  pointAt: (i: number) => { value: number; time: Time };
  /** i = the point under the pointer (null when it leaves); x = its canvas x. */
  onScrub: (i: number | null, x: number) => void;
}

/**
 * Wire pointer scrubbing onto a chart. Own pointer listeners rather than
 * subscribeCrosshairMove (which proved unreliable across chart rebuilds):
 * the pointer x maps to a logical bar index directly — data is set
 * index-aligned — and the chart's crosshair is driven explicitly so mouse
 * and touch behave identically. Returns the detach function.
 */
export function attachScrub(
  el: HTMLElement,
  chart: IChartApi,
  series: ISeriesApi<"Area">,
  target: ScrubTarget,
): () => void {
  const timeScale = chart.timeScale();
  const move = (ev: PointerEvent) => {
    const n = target.count();
    if (n === 0) return;
    const x = ev.clientX - el.getBoundingClientRect().left;
    const logical = timeScale.coordinateToLogical(x);
    if (logical === null) return;
    const i = Math.min(n - 1, Math.max(0, Math.round(logical)));
    const { value, time } = target.pointAt(i);
    chart.setCrosshairPosition(value, time, series);
    target.onScrub(i, timeScale.logicalToCoordinate(i as never) ?? x);
  };
  const leave = () => {
    chart.clearCrosshairPosition();
    target.onScrub(null, 0);
  };
  // a lifted finger ends the scrub (a mouse keeps reading until it leaves)
  const up = (ev: PointerEvent) => {
    if (ev.pointerType !== "mouse") leave();
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerdown", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointerleave", leave);
  el.addEventListener("pointercancel", leave);
  return () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerdown", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointerleave", leave);
    el.removeEventListener("pointercancel", leave);
  };
}

/**
 * Position the floating time label over the scrubbed bar, clamped inside the
 * chart so it never clips at either edge.
 */
export function placeScrubLabel(label: HTMLElement, x: number, width: number): void {
  const half = label.offsetWidth / 2;
  const left = Math.min(Math.max(x - half, 0), Math.max(0, width - label.offsetWidth));
  label.style.transform = `translateX(${Math.round(left)}px)`;
}
