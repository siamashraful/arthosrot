"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  AreaSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  LineStyle,
} from "lightweight-charts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatScrubTime, type ChartRange } from "@/lib/chart-format";
import { formatMoney } from "@/lib/format";
import { chartTokens, useThemeVersion } from "./chart-theme";
import { attachScrub, placeScrubLabel, scrubChartOptions } from "./chart-scrub";

type HistoryPoint = { t: string; value: string; netDeposits: string };

interface Plotted {
  /** Bar resolution of the plotted series (ALL resolves by account age). */
  resolution: ChartRange;
  down: boolean;
  points: Array<{ sec: number; p: HistoryPoint }>;
}

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
 * Net-worth curve — the system's LineChart on a content card (the hero never
 * carries a chart): a chart-line line over an area filled with gain-tint or
 * loss-tint by the period's direction, divider crosshair, period pills. On
 * this platform's terms: the series is derived from the ledger and fills
 * (equity-series.ts owns the honesty rules), the delta is computed
 * server-side in decimal, and gain/loss colour never means anything alone
 * (sign + arrow + sr-text always accompany it). Chart numbers are the
 * sanctioned float conversion at the rendering boundary — display only.
 */
export function NetWorthChart() {
  const [range, setRange] = useState<HistoryRange>("1M");
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const chartRef = useRef<{
    chart: IChartApi;
    series: ISeriesApi<"Area">;
    deposits: ISeriesApi<"Line">;
  } | null>(null);
  const plottedRef = useRef<Plotted | null>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [scrub, setScrub] = useState<{ i: number; x: number } | null>(null);
  const themeVersion = useThemeVersion();

  const { data, isPending, isError, isPlaceholderData } = useQuery({
    queryKey: ["portfolio-history", range],
    queryFn: () => api.portfolioHistory(range),
    refetchInterval: 30_000,
    // a range switch keeps the current line up until the new one lands
    placeholderData: keepPreviousData,
  });

  // Second-resolution render points: floor to whole seconds, then collapse
  // same-second neighbours to the LATEST value — lightweight-charts
  // hard-throws on duplicate timestamps, and a fresh account's deposit event
  // and live tail can land inside one second. Index-aligned with the series.
  const plotted = useMemo<Plotted | null>(() => {
    if (!data) return null;
    const points: Plotted["points"] = [];
    for (const point of data.points) {
      const sec = Math.floor(new Date(point.t).getTime() / 1000);
      const last = points[points.length - 1];
      if (last && last.sec === sec) last.p = point;
      else points.push({ sec, p: point });
    }
    if (points.length < 2) return null;
    // Label at the resolution the points actually have: a young account's
    // series is its own ledger events (minutes apart) even on a 1M view.
    const spanMs = (points.at(-1)!.sec - points[0]!.sec) * 1000;
    const resolution = (spanMs < 8 * 86_400_000 ? "1W" : data.resolvedRange) as ChartRange;
    return { resolution, down: data.change.absolute.startsWith("-"), points };
  }, [data]);

  // Built once per container/theme — refetches (every 30s) and range
  // switches swap the data without tearing the canvas down mid-scrub.
  useEffect(() => {
    if (!el) return;
    const t = chartTokens(el, {
      line: "--chart-line",
      grid: "--divider",
      text: "--text-tertiary",
      scrub: "--lime",
      ring: "--text",
    });
    const base = scrubChartOptions(t);
    const chart = createChart(el, {
      ...base,
      // no gridlines on the compact card chart — the tint area is the ground
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      // no time axis on the compact card: the scrub label carries the time
      timeScale: { ...base.timeScale, visible: false },
    });
    // a flat young series should sit anchored mid-panel, not float at an edge
    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.22, bottom: 0.18 } });
    const series = chart.addSeries(AreaSeries, {
      lineColor: t.line,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      // the system's scrubber handle: lime with an ink ring
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderWidth: 2,
      crosshairMarkerBackgroundColor: t.scrub,
      crosshairMarkerBorderColor: t.ring,
    });
    // Net deposits: the dotted grey comparison line — dotted vs solid is the
    // non-colour distinction (meaning never by colour alone). Surfaces only
    // while the user is ON the chart; at rest the panel shows one line.
    const deposits = chart.addSeries(LineSeries, {
      color: t.text,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });
    chartRef.current = { chart, series, deposits };
    const detach = attachScrub(el, chart, series, {
      count: () => plottedRef.current?.points.length ?? 0,
      pointAt: (i) => {
        const { sec, p } = plottedRef.current!.points[i]!;
        return { value: Number(p.value), time: sec as never };
      },
      onScrub: (i, x) => {
        deposits.applyOptions({ visible: i !== null });
        setScrub(i === null ? null : { i, x });
      },
    });
    return () => {
      detach();
      chart.remove();
      chartRef.current = null;
    };
  }, [el, themeVersion]);

  useEffect(() => {
    const target = chartRef.current;
    plottedRef.current = plotted;
    if (!el || !target || !plotted) return;
    const t = chartTokens(el, { gainFill: "--gain-tint", lossFill: "--loss-tint" });
    // area fill by period direction — the line itself never changes colour
    const fill = plotted.down ? t.lossFill : t.gainFill;
    target.series.applyOptions({ topColor: fill, bottomColor: fill });
    // rendering boundary: conversion for plotting, no arithmetic
    target.series.setData(
      plotted.points.map(({ sec, p }) => ({ time: sec as never, value: Number(p.value) })),
    );
    target.deposits.setData(
      plotted.points.map(({ sec, p }) => ({ time: sec as never, value: Number(p.netDeposits) })),
    );
    target.chart.timeScale().fitContent();
  }, [plotted, el, themeVersion]);

  useLayoutEffect(() => {
    if (scrub && labelRef.current && el) placeScrubLabel(labelRef.current, scrub.x, el.clientWidth);
  }, [scrub, el]);

  const scrubbed = scrub ? plotted?.points[scrub.i]?.p : undefined;

  const negative = data?.change.absolute.startsWith("-");
  const flat = data?.change.absolute === "0.00";
  const Arrow = negative ? ArrowDownRight : ArrowUpRight;

  return (
    <div>
      <span className="ar-caption ar-tertiary">Net worth</span>
      {scrubbed ? (
        // scrubbing: the values under the pointer (the time floats above it)
        <p className="ar-label ar-secondary chart-readout tabular" aria-live="off">
          <span className="chart-readout__price">{formatMoney(scrubbed.value)}</span>
          <span>┈ Net deposits {formatMoney(scrubbed.netDeposits)}</span>
        </p>
      ) : data ? (
        <p className="ar-label ar-secondary chart-readout" aria-live="off">
          {flat ? (
            <span className="tabular">
              <span className="sr-only">Unchanged </span>
              {formatMoney(data.change.absolute)}
            </span>
          ) : (
            <span className={`ar-delta ${negative ? "ar-delta--loss" : "ar-delta--gain"}`}>
              <Arrow className="ar-icon" size={14} strokeWidth={2.25} aria-hidden />
              <span className="sr-only">{negative ? "Down" : "Up"} </span>
              <span className="tabular">
                {negative ? "−" : "+"}
                {formatMoney(data.change.absolute.replace("-", ""))}
                {data.change.percent !== null
                  ? ` (${negative ? "−" : "+"}${data.change.percent.replace("-", "")}%)`
                  : ""}
              </span>
            </span>
          )}{" "}
          {RANGE_LABEL[data.range as HistoryRange]}
        </p>
      ) : null}

      {isError ? (
        <p className="ar-caption ar-secondary" style={{ margin: 0 }}>
          Net-worth history is unavailable right now — live values above are unaffected.
        </p>
      ) : isPending ? (
        <div className="ar-skel" style={{ height: 160 }} />
      ) : !plotted ? (
        <p className="ar-caption ar-secondary" style={{ margin: 0 }}>
          Your net-worth line starts drawing after your first market day.
        </p>
      ) : (
        <div className="chart-scrub">
          <span ref={labelRef} className="chart-scrub__label ar-caption tabular" hidden={!scrubbed}>
            {scrubbed && plotted ? formatScrubTime(scrubbed.t, plotted.resolution) : ""}
          </span>
          <div
            ref={setEl}
            className={`chart-scrub__canvas${isPlaceholderData ? " is-loading" : ""}`}
            style={{ height: 160 }}
            aria-hidden
          />
        </div>
      )}

      <div role="tablist" aria-label="Net worth range" className="ar-seg ar-seg--pills ar-periods">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={range === r}
            className={`ar-seg__item${range === r ? " is-selected" : ""}`}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>

      {data && data.points.length >= 2 ? (
        <details style={{ marginTop: 12 }}>
          <summary className="ar-caption ar-secondary" style={{ cursor: "pointer" }}>
            View as data
          </summary>
          <table className="data-table tabular" style={{ marginTop: 8 }}>
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
                  <td>{formatScrubTime(p.t, plotted?.resolution ?? "1W")}</td>
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
