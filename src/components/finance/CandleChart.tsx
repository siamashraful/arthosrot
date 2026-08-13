"use client";

import { useQuery } from "@tanstack/react-query";
import { AreaSeries, createChart, type IChartApi } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const RANGES = ["1D", "1W", "1M", "3M", "1Y", "5Y"] as const;
type Range = (typeof RANGES)[number];

/**
 * lightweight-charts' color parser predates oklch()/lab(); normalize token
 * colors to rgba via a canvas round-trip before handing them over.
 */
function normalizeColor(color: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "#888888";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${((a ?? 255) / 255).toFixed(3)})`;
}

function tokens(el: HTMLElement) {
  const styles = getComputedStyle(el);
  const get = (name: string) => normalizeColor(styles.getPropertyValue(name).trim());
  return {
    line: get("--chart-line"),
    fill: get("--chart-fill"),
    grid: get("--chart-grid"),
    text: get("--ink-muted"),
  };
}

export function CandleChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<Range>("1M");
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const { data, isPending, isError } = useQuery({
    queryKey: ["candles", symbol, range],
    queryFn: () => api.candles(symbol, range),
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data?.candles?.length) return;
    const t = tokens(el);
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: t.text,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: t.grid },
        horzLines: { color: t.grid },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: t.line,
      topColor: t.fill,
      bottomColor: "transparent",
      lineWidth: 2,
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
  }, [data]);

  return (
    <section aria-label={`${symbol} price chart`}>
      <div
        role="tablist"
        aria-label="Chart range"
        className="segmented"
        style={{ maxWidth: "22rem", marginBottom: "var(--space-3)" }}
      >
        {RANGES.map((r) => (
          <button
            key={r}
            role="tab"
            aria-selected={range === r}
            aria-pressed={range === r}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>
      {isError ? (
        <div className="empty-state">Chart data is unavailable right now.</div>
      ) : (
        <div
          ref={containerRef}
          style={{ height: "clamp(280px, 40vh, 420px)" }}
          className={isPending ? "skeleton" : undefined}
        />
      )}
      <details style={{ marginTop: "var(--space-2)" }}>
        <summary className="muted" style={{ fontSize: "var(--text-xs)", cursor: "pointer" }}>
          View data
        </summary>
        <table className="data-table">
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
