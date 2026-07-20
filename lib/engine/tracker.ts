// The tracker: one calm poll of one tracked search, and the read-side math
// that turns stored observations into what a dashboard card shows.

import type { Session, SearchStats, TrackedSearch } from "@/lib/poe/types"
import { POLL_INTERVAL_MAX, POLL_INTERVAL_MIN } from "@/lib/poe/types"
import { getDivine, getSettings, updateSearch } from "@/lib/poe/config"
import { getSavedQuery, runSearch, sampleListings, tradeSearchUrl } from "@/lib/poe/poe-client"
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

    // GGG's POST mints a search id per call — it is NOT guaranteed stable
    // across repeat submissions of the same query body (confirmed: a
    // Discovery-generated query visibly returns a different id on every
    // poll, unlike a real trade-site saved search). /api/trade/fetch's
    // query= parameter has to reference the id that actually produced the
    // ids being fetched below, or GGG can't resolve pricing/whisper tokens
    // for them — using the stored, possibly-stale search.searchId here is
    // exactly what silently broke every poll after the first for
    // Discovery-tracked searches (they'd poll, update lastPolledAt, report
    // no error, and never record a price). Keep the stored searchId/url in
    // sync with whatever GGG just handed back so the card's "open" link and
    // any future getSavedQuery retry stay pointed at something live too.
    const searchId = run.id || search.searchId
    if (searchId !== search.searchId) {
      await updateSearch(search.id, { searchId, url: tradeSearchUrl(search.league, searchId) })
    }

    const pages = Math.max(1, Math.min(settings.fetchPages, 3))
    const seen: { listingId: string; chaos: number; amount: number; currency: "chaos" | "divine" }[] = []
    let sampledPriced = 0
    for (let p = 0; p < pages; p += 1) {
      const ids = run.result.slice(p * 10, p * 10 + 10)
      if (ids.length === 0) break
      const listings = await sampleListings(session, ids, searchId, search.league)
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
  const prices = inWindow.map((o) => o.chaos)
  const median = quartiles(prices).p50
  const countBelowHalfMedian = median == null ? 0 : prices.filter((p) => p <= median * 0.5).length
  const countBelow75PctMedian = median == null ? 0 : prices.filter((p) => p <= median * 0.75).length
  const divineListings = inWindow.filter((o) => o.currency === "divine").length
  const chaosListings = inWindow.length - divineListings
  const dominantCurrency: "chaos" | "divine" = divineListings > chaosListings ? "divine" : "chaos"
  const snaps = await snapshotsInWindow(searchId, windowMs, now)
  const series = snaps
    .filter((s) => s.p50 != null)
    .map((s) => [s.t, s.p50 as number] as [number, number])
  const { trend, pct } = classifyTrend(series)

  // Flag gaps between consecutive points that are much wider than a normal
  // poll spacing (paused search, app closed, scheduler stalled) — otherwise
  // the sparkline draws a straight interpolated line across the gap as if
  // price moved smoothly through it, which is misleading. 2x the configured
  // interval is generous enough to not fire on ordinary jitter/backoff.
  const { pollIntervalMin } = await getSettings()
  const expectedGapMs =
    Math.min(POLL_INTERVAL_MAX, Math.max(POLL_INTERVAL_MIN, pollIntervalMin)) * 60_000
  const gapMarkers: number[] = []
  for (let i = 1; i < series.length; i += 1) {
    if (series[i][0] - series[i - 1][0] > expectedGapMs * 2) gapMarkers.push(series[i][0])
  }
  const fresh = await newObservationsInWindow(searchId, windowMs, now)
  // Denominator for the new-per-hour rate only — floored at 1h so a brand new
  // search with one snapshot doesn't divide by ~0. Kept separate from the
  // span shown to the user below, which should read as the honest 0 it is.
  const rateSpanHours = Math.min(windowHours, Math.max(1, (now - (snaps[0]?.t ?? now)) / 3600_000))
  const spanHours =
    snaps.length < 2 ? 0 : Math.min(windowHours, Math.round(((snaps[snaps.length - 1].t - snaps[0].t) / 3600_000) * 10) / 10)
  return {
    windowHours,
    count: inWindow.length,
    newPerHour: Math.round((fresh / rateSpanHours) * 10) / 10,
    p50: median,
    countBelowHalfMedian,
    countBelow75PctMedian,
    lastTotal: snaps.length ? snaps[snaps.length - 1].total : null,
    chaosListings,
    divineListings,
    dominantCurrency,
    spanHours,
    trend,
    trendPct: pct == null ? null : Math.round(pct * 10) / 10,
    series,
    gapMarkers,
  }
}
