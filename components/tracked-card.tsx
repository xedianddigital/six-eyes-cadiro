"use client"

// One tracked search. Reading order mirrors the decision: name → median →
// spread → volume → trend line. Everything else (pause, remove, open) stays
// visually quiet.

import { useState } from "react"
import { ago, chaosText, type CardModel } from "./api"
import { Sparkline } from "./sparkline"

const trendLabel: Record<string, string> = {
  rising: "rising",
  falling: "falling",
  stable: "stable",
  unknown: "—",
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

  return (
    <div
      className={`rounded-lg border border-neutral-800 bg-neutral-950 p-4 ${card.active ? "" : "opacity-50"}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
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
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-sm font-medium text-neutral-100"
            />
          ) : (
            <div className="flex items-center gap-1">
              <a
                href={card.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate font-medium text-neutral-100 hover:underline"
                title={card.url}
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
          <div className="text-xs text-neutral-500">
            {card.league} · polled {ago(card.lastPolledAt)}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => onPause(card.id, !card.active)}
            className="rounded border border-neutral-800 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-900"
          >
            {card.active ? "pause" : "resume"}
          </button>
          <button
            onClick={() => onRemove(card.id)}
            className="rounded border border-neutral-800 px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-900 hover:text-red-400"
          >
            remove
          </button>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-semibold tabular-nums text-neutral-50">
            {chaosText(s.p50)}
            <span className="ml-1 text-sm font-normal text-neutral-500">c median</span>
          </div>
          <div className="mt-1 text-xs tabular-nums text-neutral-400">
            p25 {chaosText(s.p25)} · p75 {chaosText(s.p75)}
          </div>
          <div className="mt-1 text-xs tabular-nums text-neutral-500">
            {s.count} listings / {s.windowHours}h
            {s.lastTotal != null ? ` · ${s.lastTotal} live` : ""} · {s.newPerHour}/h new
          </div>
        </div>
        <div className="text-right">
          <Sparkline series={s.series} trend={s.trend} width={180} height={40} />
          <div className={`mt-1 text-xs tabular-nums ${trendColor}`}>
            {trendLabel[s.trend]}
            {s.trendPct != null ? ` ${s.trendPct > 0 ? "+" : ""}${s.trendPct}%` : ""}
          </div>
        </div>
      </div>

      {card.lastError ? (
        <div className="mt-2 truncate text-xs text-amber-500" title={card.lastError}>
          {card.lastError}
        </div>
      ) : null}
    </div>
  )
}
