/**
 * The system's row sparkline (`.ar-spark`): a 56×20 line of the session's
 * closes in `--chart-line`, no fill, no direction colour — the sparkline is
 * data, not decoration, and colour stays with the delta beside it
 * (DESIGN_SYSTEM.md Refuse list: "sparklines as decoration"). Decorative to
 * assistive tech (aria-hidden): the price and the delta carry the meaning.
 * Fewer than two points render nothing.
 */

export const SPARK_WIDTH = 56;
export const SPARK_HEIGHT = 20;
/** Half the stroke, so peaks and troughs aren't clipped at the edges. */
const INSET = 1;

/**
 * Polyline points for a series of decimal-string closes. Rendering-boundary
 * geometry only (like the charts): the numbers become pixel positions and
 * never feed back into a financial value. A flat series draws mid-height.
 */
export function sparklinePoints(
  values: readonly string[],
  width = SPARK_WIDTH,
  height = SPARK_HEIGHT,
): string | null {
  const ys = values.map(Number).filter((v) => Number.isFinite(v));
  if (ys.length < 2) return null;
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min;
  const usable = height - INSET * 2;
  const step = width / (ys.length - 1);
  return ys
    .map((v, i) => {
      const x = i * step;
      const y = span === 0 ? height / 2 : INSET + (1 - (v - min) / span) * usable;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function Sparkline({ values }: { values: readonly string[] | null | undefined }) {
  const points = values ? sparklinePoints(values) : null;
  if (!points) return null;
  return (
    <svg
      className="ar-spark"
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--chart-line)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
