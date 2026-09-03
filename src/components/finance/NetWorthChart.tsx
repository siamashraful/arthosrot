"use client";

import { useQuery } from "@tanstack/react-query";
import { AreaSeries, createChart, LineSeries, LineStyle } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { chartTokens, useThemeVersion } from "./chart-theme";

const RANGES = ["1D", "1W", "1M", "3M", "1Y", "ALL"] as const;
type HistoryRange = (typeof RANGES)[number];

const RANGE_LABEL: Record<HistoryRange, string> = {
  "1D": "today",
  "1W": "past week",
  "1M": "past month",
  "3M": "past 3 months",
  "1Y": "past year",
  ALL: "all time",
};

/**
 * Net-worth curve on the dyed field (BRAND.md: the field owns the account's
 * primary region). Delta line, smooth chalk area, range
 * tabs — on this platform's terms: the series is derived from the ledger
 * and fills (equity-series.ts owns the honesty rules), the delta is computed
 * server-side in decimal, and gain/loss colour never means anything alone
 * (sign + sr-text always accompany it). Chart numbers are the sanctioned
 * float conversion at the rendering boundary — display only.
 */
export function NetWorthChart() {
  const [range, setRange] = useState<HistoryRange>("1M");
  const containerRef = useRef<HTMLDivElement>(null);
  // Hover readout is driven imperatively from the chart callback (the
  // standard lightweight-charts legend pattern): zero re-renders per
  // mousemove, and immune to setState timing across chart lifecycles.
  const deltaRef = useRef<HTMLParagraphElement>(null);
  const readoutRef = useRef<HTMLParagraphElement>(null);
  const themeVersion = useThemeVersion();

  const { data, isPending, isError } = useQuery({
    queryKey: ["portfolio-history", range],
    queryFn: () => api.portfolioHistory(range),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data || data.points.length < 2) return;
    const t = chartTokens(el, {
      line: "--chart-line-on-hero",
      fill: "--chart-fill-on-hero",
      grid: "--chart-grid-on-hero",
      text: "--hero-muted",
    });
    const depositsColor = t.text; // hero-muted: quiet beside the chalk line
    // Second-resolution render points: floor to whole seconds (the keys must
    // round-trip exactly through the crosshair callback), then collapse
    // same-second neighbours to the LATEST value — lightweight-charts
    // hard-throws on duplicate timestamps, and a fresh account's deposit
    // event and live tail can land inside one second.
    const renderPoints: Array<{ sec: number; p: (typeof data.points)[number] }> = [];
    for (const point of data.points) {
      const sec = Math.floor(new Date(point.t).getTime() / 1000);
      const last = renderPoints[renderPoints.length - 1];
      if (last && last.sec === sec) last.p = point;
      else renderPoints.push({ sec, p: point });
    }
    if (renderPoints.length < 2) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: t.text,
        attributionLogo: false,
      },
      // the warp behind the panel is the texture; the chart itself stays bare
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { borderVisible: false, timeVisible: range === "1D" },
      crosshair: {
        horzLine: { visible: false, labelVisible: false },
        vertLine: { color: t.grid, labelVisible: false },
      },
      handleScroll: false,
      handleScale: false,
    });
    // a flat young series should sit anchored mid-panel, not float at an edge
    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.22, bottom: 0.18 } });
    const series = chart.addSeries(AreaSeries, {
      lineColor: t.line,
      topColor: t.fill,
      // fade, never vanish: an anchored gradient keeps a flat line from
      // reading as a floating fragment
      bottomColor: t.fill.replace(/[0-9.]+\)$/, "0.02)"),
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
    });
    series.setData(
      renderPoints.map(({ sec, p }) => ({
        time: sec as never,
        value: Number(p.value), // rendering boundary: conversion, no arithmetic
      })),
    );
    // Net deposits: the dotted grey comparison line — dotted vs solid is the
    // non-colour distinction (meaning never by colour alone).
    const depositsSeries = chart.addSeries(LineSeries, {
      color: depositsColor,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      // surfaces only while the user is ON the chart (hover/touch) — at rest
      // the panel shows one line, the story; the comparison appears on ask
      visible: false,
    });
    depositsSeries.setData(
      renderPoints.map(({ sec, p }) => ({ time: sec as never, value: Number(p.netDeposits) })),
    );
    // Hover/touch: surface the date and both values in the readout line.
    const showHover = (point: (typeof data.points)[number] | undefined) => {
      depositsSeries.applyOptions({ visible: point !== undefined });
      const delta = deltaRef.current;
      const readout = readoutRef.current;
      if (!delta || !readout) return;
      if (point) {
        const when = range === "1D" ? formatTime(point.t) : formatDateTime(point.t);
        readout.textContent = `${when} · Net worth ${formatMoney(point.value)} · ┈ Net deposits ${formatMoney(point.netDeposits)}`;
      }
      readout.hidden = !point;
      delta.hidden = !!point;
    };
    // Own pointer listeners instead of subscribeCrosshairMove: the library
    // callback proved unreliable across chart rebuilds; nearest-point math
    // over timeToCoordinate is deterministic. The chart still paints its
    // native crosshair — we only drive the readout + deposits line.
    if (readoutRef.current) readoutRef.current.hidden = true;
    const timeScale = chart.timeScale();
    const nearestPoint = (clientX: number) => {
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      let best: { d: number; p: (typeof renderPoints)[number]["p"] } | null = null;
      for (const { sec, p: point } of renderPoints) {
        const cx = timeScale.timeToCoordinate(sec as never);
        if (cx === null) continue;
        const d = Math.abs(cx - x);
        if (!best || d < best.d) best = { d, p: point };
      }
      return best?.p;
    };
    const onMove = (ev: PointerEvent) => showHover(nearestPoint(ev.clientX));
    const onLeave = () => showHover(undefined);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointercancel", onLeave);
    chart.timeScale().fitContent();
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointercancel", onLeave);
      showHover(undefined);
      chart.remove();
    };
  }, [data, range, themeVersion]);

  const negative = data?.change.absolute.startsWith("-");
  const flat = data?.change.absolute === "0.00";

  return (
    <div>
      <p
        ref={readoutRef}
        className="muted tabular"
        style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)" }}
        aria-live="off"
      />
      {data ? (
        <p
          ref={deltaRef}
          className={flat ? "muted" : negative ? "loss" : "gain"}
          style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)" }}
          aria-live="off"
        >
          <span className="sr-only">{negative ? "Down" : flat ? "Unchanged" : "Up"} </span>
          <span className="tabular">
            {negative ? "−" : flat ? "" : "+"}
            {formatMoney(data.change.absolute.replace("-", ""))}
            {data.change.percent !== null
              ? ` (${negative ? "−" : ""}${data.change.percent.replace("-", "")}%)`
              : ""}
          </span>{" "}
          {RANGE_LABEL[range]}
        </p>
      ) : null}

      {isError ? (
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          Net-worth history is unavailable right now — live values above are unaffected.
        </p>
      ) : isPending ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : data.points.length < 2 ? (
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
          Your net-worth line starts drawing after your first market day.
        </p>
      ) : (
        <div ref={containerRef} style={{ height: 160 }} aria-hidden />
      )}

      <div
        role="tablist"
        aria-label="Net worth range"
        className="segmented"
        style={{ maxWidth: "20rem", marginTop: "var(--space-3)" }}
      >
        {RANGES.map((r) => (
          <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)}>
            {r}
          </button>
        ))}
      </div>

      {data && data.points.length >= 2 ? (
        <details style={{ marginTop: "var(--space-2)" }}>
          <summary className="muted" style={{ fontSize: "var(--text-xs)" }}>
            View as data
          </summary>
          <table className="data-table tabular" style={{ marginTop: "var(--space-2)" }}>
            <caption className="sr-only">Net worth over time</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col" className="num">
                  Net worth
                </th>
                <th scope="col" className="num">
                  Net deposits
                </th>
              </tr>
            </thead>
            <tbody>
              {data.points.slice(-10).map((p) => (
                <tr key={p.t}>
                  <td>{formatTime(p.t)}</td>
                  <td className="num">{formatMoney(p.value)}</td>
                  <td className="num">{formatMoney(p.netDeposits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}
