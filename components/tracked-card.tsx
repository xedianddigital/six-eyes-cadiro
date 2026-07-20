"use client"

// One tracked search, kept deliberately compact: this is meant to run on a
// second screen with dozens of these visible at once with no scrolling, not
// to be read one at a time. Reading order still mirrors the decision — name,
// price, direction — just packed tighter than a single-card layout would be.

import { useState } from "react"
import { ago, chaosText, type CardModel } from "./api"
import { Sparkline } from "./sparkline"

const trendLabel: Record<string, string> = {
  rising: "rising",
  falling: "falling",
  stable: "stable",
  unknown: "—",
}

const MEDIAN_TOOLTIP =
  "Median chaos-normalized ask price among the sampled cheapest instant-buyout listings in this window — not the whole market."
const MISPRICED_TOOLTIP =
  "Live count of listings priced at or below 50% / 75% of the median above — not a percentile, an actual mispricing signal. Normally 0; nonzero means someone's underpricing right now."

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

  return (
    <div
      className={`rounded-lg border border-neutral-800 bg-neutral-900 p-3 ${card.active ? "" : "opacity-50"}`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
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
                className="shrink-0 text-neutral-700 hover:text-neutral-400"
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
            className="rounded border border-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800"
          >
            {card.active ? "⏸" : "▶"}
          </button>
          <button
            onClick={() => onRemove(card.id)}
            title="Remove"
            className="rounded border border-neutral-800 px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1" title={MEDIAN_TOOLTIP}>
          <span className="text-2xl font-semibold tabular-nums text-neutral-50">{chaosText(s.p50)}</span>
          <span className="text-xs text-neutral-400">c median</span>
        </div>
        <Sparkline series={s.series} trend={s.trend} width={72} height={24} />
      </div>

      <div className="mt-0.5 flex items-center gap-3 text-[11px] tabular-nums" title={MISPRICED_TOOLTIP}>
        <span className={s.countBelowHalfMedian > 0 ? "font-medium text-green-400" : "text-neutral-500"}>
          ≤50% {s.countBelowHalfMedian}
        </span>
        <span className={s.countBelow75PctMedian > 0 ? "font-medium text-amber-400" : "text-neutral-500"}>
          ≤75% {s.countBelow75PctMedian}
        </span>
      </div>

      <div className={`mt-0.5 flex items-center justify-between text-[11px] tabular-nums ${trendColor}`}>
        <span>
          {trendLabel[s.trend]}
          {s.trendPct != null ? ` ${s.trendPct > 0 ? "+" : ""}${s.trendPct}%` : ""}
        </span>
        <span className="text-neutral-400">
          {s.count} listings · {s.newPerHour}/h new · polled {ago(card.lastPolledAt)}
        </span>
      </div>

      {card.lastError ? (
        <div className="mt-1 truncate text-[11px] text-amber-500" title={card.lastError}>
          {card.lastError}
        </div>
      ) : null}
    </div>
  )
}
