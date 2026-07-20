"use client"

// A dependency-free sparkline. The card's job is "understand the situation
// immediately", so this draws one line (p50 over time) and nothing else —
// no axes, no grid, no tooltip machinery.

export function Sparkline({
  series,
  trend,
  width = 220,
  height = 44,
}: {
  series: [number, number][]
  trend: "rising" | "falling" | "stable" | "unknown"
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

  return (
    <svg width={width} height={height} className="block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
