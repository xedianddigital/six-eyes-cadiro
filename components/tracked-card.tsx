"use client"

// One tracked search, kept deliberately compact: this is meant to run on a
// second screen with dozens of these visible at once with no scrolling, not
// to be read one at a time. Reading order still mirrors the decision — name,
// price, direction — just packed tighter than a single-card layout would be.
// Height is a hard constraint here: every row costs cards-per-screen, so
// new-per-hour stays tooltip-only, but the sample size (n=) behind the
// median and the graph's actual window coverage are both load-bearing for
// trusting the number at a glance — they're folded into the existing price
// and sparkline rows instead of a tooltip, per explicit feedback that
// hiding them made mispricing counts hard to trust (was it 4 listings or
// 40? has the graph even reached the configured window yet?).

import { useState } from "react"
import { ago, chaosText, type CardModel } from "./api"
import { Sparkline } from "./sparkline"

const MEDIAN_TOOLTIP =
  "Median chaos-normalized ask price among the sampled cheapest instant-buyout listings in this window — not the whole market."
const MISPRICED_TOOLTIP =
  "Live count of listings priced at or below 50% / 75% of the median above — not a percentile, an actual mispricing signal. Normally 0; nonzero means someone's underpricing right now."
const SPAN_TOOLTIP =
  "How much of the configured window the graph actually covers so far. A search polled only recently hasn't reached the full window yet — treat its trend as less certain until this reaches the target."

function spanLabel(spanHours: number, windowHours: number): string {
  const fmt = (h: number) => (h < 10 ? String(Math.round(h * 10) / 10) : String(Math.round(h)))
  return `${fmt(spanHours)}/${fmt(windowHours)}h`
}

export function TrackedCard({
  card,
  onPause,
  onRemove,
  onRename,
}: {
  card: CardModel
  onPause: (id: string, active: boolean) => void
  onRemove: (id: string) => void
  onRename: (id: string, title: string) => void
}) {
  const s = card.stats
  const trendColor =
    s.trend === "rising" ? "text-green-400" : s.trend === "falling" ? "text-red-400" : "text-neutral-400"
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(card.title)

  const commitRename = () => {
    setEditing(false)
    const trimmed = draftTitle.trim()
    if (trimmed && trimmed !== card.title) onRename(card.id, trimmed)
    else setDraftTitle(card.title)
  }

  const metaTooltip = `${s.newPerHour}/h new listings`

  return (
    <div
      className={`rounded-lg border border-neutral-700 bg-[#1a1a1a] p-2 ${card.active ? "" : "opacity-50"}`}
    >
      <div className="mb-0.5 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename()
                if (e.key === "Escape") {
                  setDraftTitle(card.title)
                  setEditing(false)
                }
              }}
              className="w-full rounded border border-neutral-600 bg-neutral-800 px-1 py-0.5 text-sm font-medium text-neutral-100"
            />
          ) : (
            <div className="flex items-center gap-1">
              <a
                href={card.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-sm font-medium text-neutral-100 hover:underline"
                title={card.notes ? `${card.url}\n\n${card.notes}` : card.url}
              >
                {card.title}
              </a>
              <button
                onClick={() => {
                  setDraftTitle(card.title)
                  setEditing(true)
                }}
                title="Rename"
                className="shrink-0 text-neutral-600 hover:text-neutral-300"
              >
                ✎
              </button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => onPause(card.id, !card.active)}
            title={card.active ? "Pause" : "Resume"}
            className="rounded border border-neutral-700 px-1.5 py-0.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            {card.active ? "⏸" : "▶"}
          </button>
          <button
            onClick={() => onRemove(card.id)}
            title="Remove"
            className="rounded border border-neutral-700 px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-red-400"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1" title={`${MEDIAN_TOOLTIP} n=${s.count} is the sample size behind it.`}>
          <span className="text-xl font-semibold tabular-nums text-neutral-50">{chaosText(s.p50)}</span>
          <span className="text-xs text-neutral-400">
            c median · n={s.count}
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <Sparkline series={s.series} trend={s.trend} gapMarkers={s.gapMarkers} width={64} height={20} />
          {s.series.length >= 2 ? (
            <span className="text-[9px] tabular-nums text-neutral-500" title={SPAN_TOOLTIP}>
              {spanLabel(s.spanHours, s.windowHours)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-0.5 flex items-center justify-between text-[11px] tabular-nums">
        <span className="flex gap-2" title={MISPRICED_TOOLTIP}>
          <span className={s.countBelowHalfMedian > 0 ? "font-medium text-green-400" : "text-neutral-500"}>
            ≤50% {s.countBelowHalfMedian}
          </span>
          <span className={s.countBelow75PctMedian > 0 ? "font-medium text-amber-400" : "text-neutral-500"}>
            ≤75% {s.countBelow75PctMedian}
          </span>
        </span>
        <span className={trendColor} title={metaTooltip}>
          {s.trendPct != null ? `${s.trendPct > 0 ? "+" : ""}${s.trendPct}%` : "—"} · {ago(card.lastPolledAt)}
        </span>
      </div>

      {card.lastError ? (
        <div className="mt-0.5 truncate text-[11px] text-amber-500" title={card.lastError}>
          {card.lastError}
        </div>
      ) : null}
    </div>
  )
}
