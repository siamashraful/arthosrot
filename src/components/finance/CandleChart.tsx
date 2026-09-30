"use client";

import { useQuery } from "@tanstack/react-query";
import { AreaSeries, createChart, type IChartApi } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { chartTokens, useThemeVersion } from "./chart-theme";

const RANGES = ["1D", "1W", "1M", "3M", "1Y", "5Y"] as const;
type Range = (typeof RANGES)[number];

/**
 * The price chart in the system's LineChart pattern: a chart-line line over
 * an area in gain-tint or loss-tint by the period's direction (first close
 * to last close — display comparison only), divider gridlines, period pills
 * beneath. Sits on a content card supplied by the page.
 */
export function CandleChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<Range>("1M");
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const themeVersion = useThemeVersion();

  const { data, isPending, isError } = useQuery({
    queryKey: ["candles", symbol, range],
    queryFn: () => api.candles(symbol, range),
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data?.candles?.length) return;
    const t = chartTokens(el, {
      line: "--chart-line",
      gainFill: "--gain-tint",
      lossFill: "--loss-tint",
      grid: "--divider",
      text: "--text-tertiary",
    });
    const first = data.candles[0];
    const last = data.candles[data.candles.length - 1];
    // period direction for the fill only — rendering-boundary comparison
    const down = first && last ? Number(last.close) < Number(first.close) : false;
    const fill = down ? t.lossFill : t.gainFill;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: t.text,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: t.grid },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: {
        vertLine: { color: t.grid, labelVisible: false },
        horzLine: { color: t.grid },
      },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: t.line,
      topColor: fill,
      bottomColor: fill,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    series.setData(
      data.candles.map((c) => ({
        time: (new Date(c.time).getTime() / 1000) as never,
        value: Number(c.close),
      })),
    );
    chart.timeScale().fitContent();
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, themeVersion]);

  return (
    <section aria-label={`${symbol} price chart`}>
      {isError ? (
        <div className="ar-empty">
          <span className="ar-empty__text">Chart data is unavailable right now.</span>
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{ height: "clamp(240px, 36vh, 380px)" }}
          className={isPending ? "ar-skel" : undefined}
        />
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
            {symbol} closing prices, {range}
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
            {(data?.candles ?? []).slice(-20).map((c) => (
              <tr key={c.time}>
                <td>{new Date(c.time).toLocaleDateString()}</td>
                <td className="num">{Number(c.close).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
