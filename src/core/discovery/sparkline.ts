/**
 * Sparkline series — a session's closes thinned to a small, fixed number of
 * points for a 56×20 row sparkline. Pure selection: values pass through
 * untouched as the provider's decimal strings (no arithmetic on prices).
 * The first and last points are always kept, so the line ends at the latest
 * close.
 */

export const SPARKLINE_MAX_POINTS = 40;

export function downsampleSeries<T>(
  values: readonly T[],
  maxPoints: number = SPARKLINE_MAX_POINTS,
): T[] {
  if (maxPoints < 2) throw new Error("downsampleSeries needs at least 2 points");
  if (values.length <= maxPoints) return [...values];
  const last = values.length - 1;
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    // evenly spaced indices over [0, last]; integer math only
    out.push(values[Math.round((i * last) / (maxPoints - 1))]!);
  }
  return out;
}
