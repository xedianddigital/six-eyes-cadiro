"use client"

// One tracked search, kept deliberately compact: this is meant to run on a
// second screen with dozens of these visible at once with no scrolling, not
// to be read one at a time. Reading order still mirrors the decision — name,
// price, direction — just packed tighter than a single-card layout would be.
// Height is a hard constraint here: every row costs cards-per-screen, but the
// sample size behind the median and the graph's actual window coverage are
// both load-bearing for trusting the number at a glance, so they're visible
// text rather than tooltip-only (was it 4 listings or 40? has the graph even
// reached the configured window yet?).
//
// Layout is three columns (title+price on the left; span label above the
// sparkline in the middle; remove/pause/open stacked on the right, flush to
// the border), vertically centered rather than stretched to share the row's
// full height — three 24px buttons are the tallest column now, and
// stretching the shorter ones to match just spread their own contents out
// with awkward extra gaps (read as "room for a 4th button"). Centering
// instead keeps title/price and the graph tight and leaves any leftover
// height as quiet balanced space above/below, not inside them.

import { useState } from "react"
import { ago, chaosText, divineText, type CardModel } from "./api"
import { Sparkline } from "./sparkline"

// 24px, matching every other icon button in the app (e.g. Import's row
// actions) — the owner asked for this back after 22px read as cramped, and
// for the card to get shorter elsewhere instead: card padding and the
// button-to-button gap are what actually shrank to compensate, not the
// buttons themselves.
const ICON_BUTTON =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded border border-neutral-700 text-xs"

const MEDIAN_TOOLTIP =
  "Median chaos-normalized ask price among the sampled cheapest instant-buyout listings in this window — not the whole market."
function dominantTooltip(s: CardModel["stats"]): string {
  return `${MEDIAN_TOOLTIP} Shown in whichever currency most sellers actually used: ${s.chaosListings} listing${s.chaosListings === 1 ? "" : "s"} priced in chaos, ${s.divineListings} in divine.`
}
const MISPRICED_TOOLTIP =
  "Live count of listings priced at or below 50% / 75% of the median above — not a percentile, an actual mispricing signal. Normally 0; nonzero means someone's underpricing right now."
const LISTINGS_TOOLTIP =
  "Distinct instant-buyout listings observed in this window — the sample size behind the median above. Judge its confidence accordingly: 4 listings and 40 aren't equally trustworthy."
const SPAN_TOOLTIP =
  "How much of the configured window the graph actually covers so far. A search polled only recently hasn't reached the full window yet — treat its trend as less certain until this reaches the target."

function spanLabel(spanHours: number, windowHours: number): string {
  const fmt = (h: number) => (h < 10 ? String(Math.round(h * 10) / 10) : String(Math.round(h)))
  return `${fmt(spanHours)}/${fmt(windowHours)}h`
}

export function TrackedCard({
  card,
  divineRate,
  onPause,
  onRemove,
  onRename,
}: {
  card: CardModel
  /** Current chaos-per-divine rate, for the divine-equivalent shown next to the median. */
  divineRate: number
  onPause: (id: string, active: boolean) => void
  onRemove: (id: string) => void
  onRename: (id: string, title: string) => void
}) {
  const s = card.stats
  const trendColor =
    s.trend === "rising" ? "text-green-400" : s.trend === "falling" ? "text-red-400" : "text-neutral-400"
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(card.title)
  const divine = divineText(s.p50, divineRate)

  const commitRename = () => {
    setEditing(false)
    const trimmed = draftTitle.trim()
    if (trimmed && trimmed !== card.title) onRename(card.id, trimmed)
    else setDraftTitle(card.title)
  }

  const metaTooltip = `${s.newPerHour}/h new listings`

  return (
    <div
      className={`rounded-lg border border-neutral-700 bg-[#1a1a1a] p-1 ${card.active ? "" : "opacity-50"}`}
    >
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
            <div className="flex items-center gap-1 leading-tight">
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
          <div className="flex items-baseline gap-1" title={dominantTooltip(s)}>
            {s.dominantCurrency === "divine" && divine ? (
              <>
                <span className="text-xl font-semibold tabular-nums text-neutral-50">{divine}</span>
                <span className="text-sm font-semibold text-neutral-300">d</span>
                <span className="mx-1 text-neutral-600">·</span>
                <span className="text-sm tabular-nums text-neutral-400">{chaosText(s.p50)}c</span>
              </>
            ) : (
              <>
                <span className="text-xl font-semibold tabular-nums text-neutral-50">{chaosText(s.p50)}</span>
                <span className="text-sm font-semibold text-neutral-300">c</span>
                {divine ? (
                  <>
                    <span className="mx-1 text-neutral-600">·</span>
                    <span className="text-sm tabular-nums text-neutral-400">{divine}d</span>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-0.5">
          {s.series.length >= 2 ? (
            <span className="text-[9px] tabular-nums text-neutral-500" title={SPAN_TOOLTIP}>
              {spanLabel(s.spanHours, s.windowHours)}
            </span>
          ) : null}
          <Sparkline series={s.series} trend={s.trend} gapMarkers={s.gapMarkers} width={76} height={56} />
        </div>

        <div className="flex shrink-0 flex-col items-end gap-px">
          <button
            onClick={() => onRemove(card.id)}
            title="Remove"
            className={ICON_BUTTON + " text-neutral-400 hover:bg-neutral-800 hover:text-red-400"}
          >
            ✕
          </button>
          <button
            onClick={() => onPause(card.id, !card.active)}
            title={card.active ? "Pause" : "Resume"}
            className={ICON_BUTTON + " text-neutral-300 hover:bg-neutral-800"}
          >
            {card.active ? "⏸" : "▶"}
          </button>
          <a
            href={card.url}
            target="_blank"
            rel="noreferrer"
            title="Open on the trade site"
            className={ICON_BUTTON + " text-neutral-300 hover:bg-neutral-800"}
          >
            ↗
          </a>
        </div>
      </div>

      <div className="mt-px flex items-center justify-between text-[11px] leading-tight tabular-nums pr-7">
        <span className="flex items-center gap-2" title={MISPRICED_TOOLTIP}>
          <span className={s.countBelowHalfMedian > 0 ? "font-medium text-green-400" : "text-neutral-500"}>
            ≤50% {s.countBelowHalfMedian}
          </span>
          <span className={s.countBelow75PctMedian > 0 ? "font-medium text-amber-400" : "text-neutral-500"}>
            ≤75% {s.countBelow75PctMedian}
          </span>
          <span className="text-neutral-400" title={LISTINGS_TOOLTIP}>
            Listings: {s.count}
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
