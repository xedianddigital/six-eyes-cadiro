// Global settings: league, polling cadence, window, discovery pace, divine rate.

import { getSettings, saveSettings, saveDivine } from "@/lib/poe/config"
import { scheduler } from "@/lib/engine/scheduler"
import { fetchDivineRate } from "@/lib/ninja"
import {
  DISCOVERY_PER_HOUR_MAX,
  FETCH_PAGES_MAX,
  POLL_INTERVAL_MAX,
  POLL_INTERVAL_MIN,
  WINDOW_HOURS_CHOICES,
} from "@/lib/poe/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  return Response.json(await getSettings())
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)))

export async function PATCH(req: Request): Promise<Response> {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.league === "string" && body.league.trim()) patch.league = body.league.trim()
  if (typeof body.pollIntervalMin === "number" && Number.isFinite(body.pollIntervalMin)) {
    // Clamp rather than reject: these bounds exist to keep request rates sane,
    // and a slider out of range shouldn't fail the whole save.
    patch.pollIntervalMin = clamp(body.pollIntervalMin, POLL_INTERVAL_MIN, POLL_INTERVAL_MAX)
  }
  if (typeof body.windowHours === "number") {
    const choices = WINDOW_HOURS_CHOICES as readonly number[]
    patch.windowHours = choices.includes(body.windowHours) ? body.windowHours : 6
  }
  if (typeof body.retentionDays === "number" && Number.isFinite(body.retentionDays)) {
    patch.retentionDays = clamp(body.retentionDays, 3, 30)
  }
  if (typeof body.fetchPages === "number" && Number.isFinite(body.fetchPages)) {
    patch.fetchPages = clamp(body.fetchPages, 1, FETCH_PAGES_MAX)
  }
  if (typeof body.discoveryPerHour === "number" && Number.isFinite(body.discoveryPerHour)) {
    patch.discoveryPerHour = clamp(body.discoveryPerHour, 0, DISCOVERY_PER_HOUR_MAX)
  }
  if (typeof body.manualDivineRate === "number" && Number.isFinite(body.manualDivineRate) && body.manualDivineRate > 0) {
    patch.manualDivineRate = Math.round(body.manualDivineRate)
  }
  if (typeof body.useNinjaRate === "boolean") patch.useNinjaRate = body.useNinjaRate
  if (typeof body.coordinationHoldSec === "number" && Number.isFinite(body.coordinationHoldSec)) {
    patch.coordinationHoldSec = clamp(body.coordinationHoldSec, 0, 120)
  }

  const settings = await saveSettings(patch)

  // Without this, the divine rate (and every card's divine-equivalent
  // display, which reads it live) stayed stale against the scheduler's
  // hourly refresh cadence for up to an hour after changing either of
  // these — a toggle that visibly does nothing for 60 minutes reads as
  // broken. Both branches apply synchronously here rather than waiting for
  // the scheduler's next tick: manual mode needs no network call at all,
  // and re-enabling poe.ninja is safe to call inline too now that
  // fetchDivineRate serves its last-known-good cached value instead of
  // null when called again inside its 10-minute floor (see lib/ninja.ts) —
  // that floor-returning-null-instead-of-cache was the actual bug behind
  // "re-checking poe.ninja doesn't bring the rate back."
  if ("useNinjaRate" in patch || "manualDivineRate" in patch) {
    if (settings.useNinjaRate) {
      const rate = await fetchDivineRate(settings.league)
      if (rate) await saveDivine({ rate, source: "ninja", updatedAt: Date.now() })
    } else {
      await saveDivine({ rate: settings.manualDivineRate, source: "manual", updatedAt: Date.now() })
    }
    scheduler.noteDivineRefreshed()
  }

  return Response.json({ ok: true, settings })
}
