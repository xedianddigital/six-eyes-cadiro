"use client"

// A dependency-free sparkline. The card's job is "understand the situation
// immediately", so this draws one line (p50 over time) and nothing else —
// no axes, no grid, no tooltip machinery.

export function Sparkline({
  series,
  trend,
  gapMarkers,
  width = 220,
  height = 44,
}: {
  series: [number, number][]
  trend: "rising" | "falling" | "stable" | "unknown"
  /** Timestamps of unusually large gaps between snapshots — see SearchStats.gapMarkers. */
  gapMarkers?: number[]
  width?: number
  height?: number
}) {
  if (series.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs text-neutral-600"
        style={{ width, height }}
      >
        collecting…
      </div>
    )
  }

  const ts = series.map(([t]) => t)
  const vs = series.map(([, v]) => v)
  const tMin = Math.min(...ts)
  const tMax = Math.max(...ts)
  const vMin = Math.min(...vs)
  const vMax = Math.max(...vs)
  const tSpan = Math.max(1, tMax - tMin)
  const vSpan = Math.max(vMax - vMin, vMax * 0.02, 0.1)
  const pad = 3

  const points = series
    .map(([t, v]) => {
      const x = pad + ((t - tMin) / tSpan) * (width - pad * 2)
      const y = height - pad - ((v - vMin) / vSpan) * (height - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")

  const color =
    trend === "rising" ? "#4ade80" : trend === "falling" ? "#f87171" : "#a3a3a3"

  const gapXs = (gapMarkers ?? [])
    .filter((t) => t >= tMin && t <= tMax)
    .map((t) => pad + ((t - tMin) / tSpan) * (width - pad * 2))

  return (
    <svg width={width} height={height} className="block">
      {gapXs.length > 0 ? (
        <title>Dashed line(s) mark a gap between polls much wider than usual — price didn&apos;t really move smoothly through it, the data is just missing there.</title>
      ) : null}
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {gapXs.map((x, i) => (
        <line
          key={i}
          x1={x}
          x2={x}
          y1={pad}
          y2={height - pad}
          stroke="#71717a"
          strokeWidth="1"
          strokeDasharray="2,2"
        />
      ))}
    </svg>
  )
}
