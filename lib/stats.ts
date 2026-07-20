// Small, dependency-free statistics. Percentiles instead of "mean minus
// extremes": PoE ask distributions are heavily right-skewed, and the median
// with quartiles answers the actual question ("what does this sell for, and
// how wide is the market") without any outlier-trimming heuristics to tune.

export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0]
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const frac = idx - lo
  return sorted[lo] * (1 - frac) + sorted[hi] * frac
}

export interface Quartiles {
  p25: number | null
  p50: number | null
  p75: number | null
}

export function quartiles(values: number[]): Quartiles {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
  }
}

export type Trend = "rising" | "falling" | "stable" | "unknown"

/**
 * Classify a p50 series over the window. Compares the median of the first and
 * last thirds of the series rather than fitting a line: robust to a single
 * weird poll, and directly answers "is the market above or below where it was".
 */
export function classifyTrend(series: [number, number][]): { trend: Trend; pct: number | null } {
  const points = series.filter(([, v]) => Number.isFinite(v))
  if (points.length < 4) return { trend: "unknown", pct: null }
  const third = Math.max(1, Math.floor(points.length / 3))
  const head = points.slice(0, third).map(([, v]) => v)
  const tail = points.slice(-third).map(([, v]) => v)
  const headMed = percentile([...head].sort((a, b) => a - b), 0.5)
  const tailMed = percentile([...tail].sort((a, b) => a - b), 0.5)
  if (headMed == null || tailMed == null || headMed === 0) return { trend: "unknown", pct: null }
  const pct = ((tailMed - headMed) / headMed) * 100
  // Under ±3% is market noise, not a signal worth colouring a card over.
  if (Math.abs(pct) < 3) return { trend: "stable", pct }
  return { trend: pct > 0 ? "rising" : "falling", pct }
}
