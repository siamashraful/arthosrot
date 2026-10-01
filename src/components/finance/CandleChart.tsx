"use client";

import { useQuery } from "@tanstack/react-query";
import { AreaSeries, createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatScrubTime, priceChange, type ChartRange } from "@/lib/chart-format";
import { formatPrice } from "@/lib/format";
import { chartTokens, useThemeVersion } from "./chart-theme";
import { attachScrub, placeScrubLabel, scrubChartOptions } from "./chart-scrub";
import { PriceChange } from "./PriceChange";

const RANGES = ["1D", "1W", "1M", "3M", "1Y", "5Y"] as const;
type Range = (typeof RANGES)[number];

const RANGE_LABEL: Record<ChartRange, string> = {
  "1D": "last session",
  "1W": "past week",
  "1M": "past month",
  "3M": "past 3 months",
  "1Y": "past year",
  "5Y": "past 5 years",
};

interface Plotted {
  range: ChartRange;
  points: Array<{ time: number; iso: string; close: string }>;
}

/**
 * The price chart in the system's LineChart pattern: a chart-line line over
 * an area in gain-tint or loss-tint by the period's direction, divider
 * gridlines, period pills beneath. A fixed picture of the range (no pan or
 * zoom — chart-scrub.ts): at rest the readout carries the range's change;
 * scrubbing shows the price under the pointer, its change since the range
 * opened, and a floating date/time label at the bar's resolution. The live
 * quote stays in the page header with its freshness chip — a scrubbed price
 * is always shown with the time it belongs to.
 */
export function CandleChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<Range>("1M");
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const chartRef = useRef<{ chart: IChartApi; series: ISeriesApi<"Area"> } | null>(null);
  const plottedRef = useRef<Plotted | null>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [scrub, setScrub] = useState<{ i: number; x: number } | null>(null);
  const themeVersion = useThemeVersion();

  const { data, isPending, isError, isPlaceholderData } = useQuery({
    queryKey: ["candles", symbol, range],
    queryFn: () => api.candles(symbol, range),
    // Switching range keeps the current line up until the new one arrives —
    // no skeleton flash between pills. Never across symbols.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === symbol ? prev : undefined),
  });

  // The chart itself: built once per container/theme, never per data change,
  // so a refetch or range switch swaps the line without tearing down the
  // canvas (and without dropping an in-progress scrub).
  useEffect(() => {
    if (!el) return;
    const t = chartTokens(el, {
      grid: "--divider",
      text: "--text-tertiary",
      line: "--chart-line",
      scrub: "--lime",
      ring: "--text",
    });
    const chart = createChart(el, {
      ...scrubChartOptions(t),
      grid: { vertLines: { visible: false }, horzLines: { color: t.grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
    });
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
    chartRef.current = { chart, series };
    const detach = attachScrub(el, chart, series, {
      count: () => plottedRef.current?.points.length ?? 0,
      pointAt: (i) => {
        const p = plottedRef.current!.points[i]!;
        return { value: Number(p.close), time: p.time as never };
      },
      onScrub: (i, x) => setScrub(i === null ? null : { i, x }),
    });
    return () => {
      detach();
      chart.remove();
      chartRef.current = null;
    };
  }, [el, themeVersion]);

  const plotted = useMemo<Plotted | null>(
    () =>
      data?.candles.length
        ? {
            range: data.range as ChartRange,
            points: data.candles.map((c) => ({
              time: Math.floor(Date.parse(c.time) / 1000),
              iso: c.time,
              close: c.close,
            })),
          }
        : null,
    [data],
  );

  // The data: swapped into the existing series.
  useEffect(() => {
    const target = chartRef.current;
    plottedRef.current = plotted;
    if (!el || !target || !plotted) return;
    const { points } = plotted;
    const t = chartTokens(el, { gainFill: "--gain-tint", lossFill: "--loss-tint" });
    const down = priceChange(points[0]!.close, points.at(-1)!.close).direction < 0;
    const fill = down ? t.lossFill : t.gainFill;
    target.series.applyOptions({ topColor: fill, bottomColor: fill });
    // rendering boundary: string → number for plotting only, no arithmetic
    target.series.setData(points.map((p) => ({ time: p.time as never, value: Number(p.close) })));
    // intraday ranges label the axis with times, the rest with dates
    target.chart.applyOptions({
      timeScale: { timeVisible: plotted.range === "1D" || plotted.range === "1W" },
    });
    target.chart.timeScale().fitContent();
    setScrub(null);
  }, [plotted, el, themeVersion]);

  useLayoutEffect(() => {
    if (scrub && labelRef.current && el) placeScrubLabel(labelRef.current, scrub.x, el.clientWidth);
  }, [scrub, el]);

  const points = plotted?.points ?? [];
  const first = points[0];
  const scrubbed = scrub ? points[scrub.i] : undefined;
  const last = points.at(-1);
  const change =
    first && (scrubbed ?? last) ? priceChange(first.close, (scrubbed ?? last)!.close) : null;

  return (
    <section aria-label={`${symbol} price chart`}>
      {/* Readout: range change at rest; price + change since the range
          opened while scrubbing. Fixed height so the chart never jumps. */}
      <p className="ar-label ar-secondary chart-readout" aria-live="off">
        {scrubbed && change ? (
          <>
            <span className="tabular chart-readout__price">{formatPrice(scrubbed.close)}</span>
            <PriceChange amount={change.absolute} percent={pctNumber(change.percent)} />
          </>
        ) : change ? (
          <>
            <PriceChange amount={change.absolute} percent={pctNumber(change.percent)} />
            <span>{RANGE_LABEL[plotted!.range]}</span>
          </>
        ) : null}
      </p>

      {isError && !data ? (
        <div className="ar-empty">
          <span className="ar-empty__text">Chart data is unavailable right now.</span>
        </div>
      ) : (
        <div className="chart-scrub">
          <span ref={labelRef} className="chart-scrub__label ar-caption tabular" hidden={!scrubbed}>
            {scrubbed ? formatScrubTime(scrubbed.iso, plotted!.range) : ""}
          </span>
          <div
            ref={setEl}
            className={`chart-scrub__canvas${isPending ? " ar-skel" : ""}${isPlaceholderData ? " is-loading" : ""}`}
            style={{ height: "clamp(240px, 36vh, 380px)" }}
            aria-hidden
          />
        </div>
      )}
      <div role="tablist" aria-label="Chart range" className="ar-seg ar-seg--pills ar-periods">
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
      <details style={{ marginTop: 12 }}>
        <summary className="ar-caption ar-secondary" style={{ cursor: "pointer" }}>
          View data
        </summary>
        <table className="data-table" style={{ marginTop: 8 }}>
          <caption className="sr-only">
            {symbol} closing prices, {plotted?.range ?? range}
          </caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col" className="num">
                Close
              </th>
            </tr>
          </thead>
          <tbody>
            {points.slice(-20).map((p) => (
              <tr key={p.iso}>
                <td>{formatScrubTime(p.iso, plotted!.range)}</td>
                <td className="num tabular">{formatPrice(p.close)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/** PriceChange takes a number percent; display-only conversion of a 2dp string. */
function pctNumber(percent: string | null): number | undefined {
  return percent === null ? undefined : Number(percent);
}
