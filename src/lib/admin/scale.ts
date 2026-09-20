/**
 * Axis arithmetic.
 *
 * A chart whose axis tops out at 71 is a chart nobody can read a value off:
 * the ticks have to be numbers people round to. This is pure so it can be
 * tested directly, because the failure mode is subtle — an axis that is merely
 * slightly wrong still looks like a chart.
 */

/** Rounds an axis maximum up to 1, 2, 5 or 10 times a power of ten. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 4;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;

  return step * magnitude;
}

/**
 * The share of the axis a value occupies, as a percentage.
 *
 * A non-zero value always gets a visible sliver: a day with one run must not
 * render identically to a day with none, or the chart says something false.
 */
export function barHeight(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return 0;

  return Math.max((value / max) * 100, 2);
}
