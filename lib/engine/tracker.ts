// The tracker: one calm poll of one tracked search, and the read-side math
// that turns stored observations into what a dashboard card shows.

import type { Session, SearchStats, TrackedSearch } from "@/lib/poe/types"
import { getDivine, getSettings, updateSearch } from "@/lib/poe/config"
import { getSavedQuery, runSearch, sampleListings } from "@/lib/poe/poe-client"
import {
  newObservationsInWindow,
  observationsInWindow,
  recordObservations,
  recordSnapshot,
  snapshotsInWindow,
} from "@/lib/store/observations"
import { classifyTrend, quartiles } from "@/lib/stats"

/**
 * Poll one tracked search:
 *   1 POST to execute the cached query (fetching+caching it first if missing),
 *   then `fetchPages` GETs of 10 result ids each.
 *
 * Sorted by price ascending, the sampled pages are the cheap frontier of the
 * market — exactly the part a flipper prices against. Only instant-buyout
 * listings priced in chaos or divine make it into the store.
 */
export async function pollSearch(session: Session, search: TrackedSearch): Promise<void> {
  const settings = await getSettings()
  const divine = await getDivine()
  const now = Date.now()

  try {
    let query = search.cachedQuery
    if (!query) {
      query = await getSavedQuery(session, search.league, search.searchId)
      await updateSearch(search.id, { cachedQuery: query })
    }

    let run
    try {
      run = await runSearch(session, search.league, query)
    } catch (err) {
      // A 400 usually means the cached query shape went stale (site update,
      // league rollover). Refetch the definition once and retry.
      const msg = String((err as Error).message ?? "")
      if (!msg.startsWith("400")) throw err
      query = await getSavedQuery(session, search.league, search.searchId)
      await updateSearch(search.id, { cachedQuery: query })
      run = await runSearch(session, search.league, query)
    }

    const pages = Math.max(1, Math.min(settings.fetchPages, 3))
    const seen: { listingId: string; chaos: number; amount: number; currency: "chaos" | "divine" }[] = []
    let sampledPriced = 0
    for (let p = 0; p < pages; p += 1) {
      const ids = run.result.slice(p * 10, p * 10 + 10)
      if (ids.length === 0) break
      const listings = await sampleListings(session, ids, search.searchId, search.league)
      for (const l of listings) {
        sampledPriced += 1
        if (!l.instantBuyout) continue
        const chaos = l.currency === "divine" ? l.amount * divine.rate : l.amount
        seen.push({ listingId: l.id, chaos, amount: l.amount, currency: l.currency })
      }
    }

    await recordObservations(search.id, seen, now)

    // Snapshot the window state at poll time — this is what the graph draws.
    const windowMs = settings.windowHours * 3600_000
    const inWindow = await observationsInWindow(search.id, windowMs, now)
    const q = quartiles(inWindow.map((o) => o.chaos))
    await recordSnapshot(search.id, {
      t: now,
      total: run.total,
      sampled: sampledPriced,
      p25: q.p25,
      p50: q.p50,
      p75: q.p75,
      windowCount: inWindow.length,
    })

    await updateSearch(search.id, { lastPolledAt: now, lastError: null })
  } catch (err) {
    await updateSearch(search.id, { lastPolledAt: now, lastError: (err as Error).message })
    throw err
  }
}

/** Compute what one card displays, for the currently configured window. */
export async function statsFor(searchId: string, windowHours: number): Promise<SearchStats> {
  const windowMs = windowHours * 3600_000
  const now = Date.now()
  const inWindow = await observationsInWindow(searchId, windowMs, now)
  const q = quartiles(inWindow.map((o) => o.chaos))
  const snaps = await snapshotsInWindow(searchId, windowMs, now)
  const series = snaps
    .filter((s) => s.p50 != null)
    .map((s) => [s.t, s.p50 as number] as [number, number])
  const { trend, pct } = classifyTrend(series)
  const fresh = await newObservationsInWindow(searchId, windowMs, now)
  const spanHours = Math.min(windowHours, Math.max(1, (now - (snaps[0]?.t ?? now)) / 3600_000))
  return {
    windowHours,
    count: inWindow.length,
    newPerHour: Math.round((fresh / spanHours) * 10) / 10,
    p25: q.p25,
    p50: q.p50,
    p75: q.p75,
    lastTotal: snaps.length ? snaps[snaps.length - 1].total : null,
    trend,
    trendPct: pct == null ? null : Math.round(pct * 10) / 10,
    series,
  }
}
