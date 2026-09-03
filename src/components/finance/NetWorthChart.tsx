"use client";

import { useQuery } from "@tanstack/react-query";
import { AreaSeries, createChart } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatMoney, formatTime } from "@/lib/format";
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
      line: "--chart-line-on-field",
      fill: "--chart-fill-on-field",
      grid: "--chart-grid-on-field",
      text: "--field-muted",
    });
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
    const series = chart.addSeries(AreaSeries, {
      lineColor: t.line,
      topColor: t.fill,
      bottomColor: "transparent",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
    });
    series.setData(
      data.points.map((p) => ({
        time: (new Date(p.t).getTime() / 1000) as never,
        value: Number(p.value), // rendering boundary: conversion, no arithmetic
      })),
    );
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [data, range, themeVersion]);

  const negative = data?.change.absolute.startsWith("-");
  const flat = data?.change.absolute === "0.00";

  return (
    <div>
      {data ? (
        <p
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
              </tr>
            </thead>
            <tbody>
              {data.points.slice(-10).map((p) => (
                <tr key={p.t}>
                  <td>{formatTime(p.t)}</td>
                  <td className="num">{formatMoney(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}
