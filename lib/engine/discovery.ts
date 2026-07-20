// Discovery — task #2, honestly scoped.
//
// Global "notice any mispriced item" surveillance needs the Public Stash Tab
// river, which GGG gates behind a service OAuth scope granted to established
// aggregators. This app does the legitimate version instead: poe.ninja's
// public economy data defines a curated universe of liquid uniques, and a slow
// rotation verifies the most interesting ones against the live trade site —
// a couple of GGG requests per verification, a handful per hour, budgeted by
// the same limiter as everything else.
//
// A candidate is interesting when the cheap end of its live listings sits well
// below its own median: that spread is exactly the "10 cases more than 10%
// below average" pattern the user described, computed from asks.

import type { DiscoveryCandidate, Session } from "@/lib/poe/types"
import { getDiscovery, getSearches, getSettings, saveDiscovery, updateCandidate } from "@/lib/poe/config"
import { runSearch, sampleListings, tradeSearchUrl } from "@/lib/poe/poe-client"
import { fetchUniqueUniverse } from "@/lib/ninja"
import { percentile } from "@/lib/stats"
import { getDivine } from "@/lib/poe/config"
import { logEvent } from "@/lib/store/logs"

const UNIVERSE_TTL_MS = 24 * 3600_000
/** Verified numbers go stale; revisit a candidate after this long. */
const VERIFY_TTL_MS = 12 * 3600_000
/** Flip band: below this it's not worth the clicks, above it the market is thin. */
const MIN_CHAOS = 15
const MAX_CHAOS = 6000
/** Keep this many candidates in rotation, ranked by liquidity. */
const UNIVERSE_SIZE = 80
/** Bump whenever queryFor()'s shape changes in a way that invalidates every previously-verified id/url. */
const QUERY_VERSION = 2

/** Refresh the candidate universe from poe.ninja if it's older than a day. */
export async function refreshUniverse(): Promise<void> {
  const settings = await getSettings()
  let discovery = await getDiscovery()

  if (discovery.queryVersion !== QUERY_VERSION) {
    // Every previously-verified candidate's `verified.url` was minted by a
    // POST using the OLD queryFor shape — for the sale_type bug fixed in
    // 0.6.0, that means the "open" link still shows "In-person only" on the
    // real trade site no matter what the current code generates, because
    // the id is permanently bound to whatever query actually created it.
    // Each candidate's own 12h re-verify would eventually catch up on its
    // own, but that's a slow, silent fix a user has no way to know is
    // coming. Force it now instead: wipe every `verified` so the next
    // rotation re-verifies everyone against the corrected query.
    const stale = discovery.candidates.filter((c) => c.verified).length
    discovery = {
      ...discovery,
      candidates: discovery.candidates.map((c) => (c.verified ? { ...c, verified: null } : c)),
      queryVersion: QUERY_VERSION,
    }
    await saveDiscovery(discovery)
    if (stale > 0) {
      await logEvent(
        "discovery",
        `Query format changed — re-verifying ${stale} candidate${stale === 1 ? "" : "s"} (old links had a wrong trade filter baked in)`,
      )
    }
  }

  if (Date.now() - discovery.refreshedAt < UNIVERSE_TTL_MS) return

  const universe = await fetchUniqueUniverse(settings.league)
  if (universe.length === 0) {
    // ninja unreachable or league name wrong; try again next cycle without
    // wiping what we have.
    return
  }

  const dismissed = new Set(discovery.candidates.filter((c) => c.dismissed).map((c) => c.key))
  const verifiedByKey = new Map(discovery.candidates.map((c) => [c.key, c.verified] as const))

  const candidates: DiscoveryCandidate[] = universe
    .filter((i) => i.chaosValue >= MIN_CHAOS && i.chaosValue <= MAX_CHAOS)
    .sort((a, b) => b.count - a.count)
    .slice(0, UNIVERSE_SIZE)
    .map((i) => ({
      key: i.key,
      name: i.name,
      ninjaType: i.ninjaType,
      ninjaChaos: Math.round(i.chaosValue),
      ninjaCount: i.count,
      verified: verifiedByKey.get(i.key) ?? null,
      dismissed: dismissed.has(i.key),
    }))

  await saveDiscovery({ refreshedAt: Date.now(), candidates })
}

/**
 * The generated name-only search: online sellers, cheapest first.
 *
 * Deliberately carries NO sale_type filter. `trade_filters.filters.
 * sale_type: { option: "priced" }` was here originally, intended to mean
 * "has a price" — but opening a generated URL in a real browser (the
 * "open" button on a Discovery row) showed the trade site's own filter
 * panel reading "Sale type: In-person only", the opposite of what this app
 * is built around (see the hard constraint on instant-buyout-only pricing
 * in CLAUDE.md). Rather than guess at the correct option string, the
 * filter is dropped entirely: this app's actual buyout/no-buyout
 * distinction has never come from a server-side search filter anyway — it
 * comes from decoding each fetched listing's whisper/hideout token
 * client-side (`decodeWhisperToken` in poe-client.ts's `sampleListings`),
 * which is unaffected by this query's filters either way. Dropping it only
 * means the initial 10-20 sampled ids may include a few more
 * non-instant/negotiable listings that then get correctly filtered out
 * after the fetch — a minor sampling-efficiency cost, not a correctness one.
 */
export function queryFor(name: string): unknown {
  return {
    query: {
      status: { option: "online" },
      name,
      stats: [{ type: "and", filters: [] }],
    },
    sort: { price: "asc" },
  }
}

/** Pick the next candidate worth verifying, or null. */
async function nextToVerify(): Promise<DiscoveryCandidate | null> {
  const discovery = await getDiscovery()
  const tracked = new Set((await getSearches()).map((s) => s.title.toLowerCase()))
  const due = discovery.candidates.filter(
    (c) =>
      !c.dismissed &&
      !tracked.has(c.name.toLowerCase()) &&
      (!c.verified || Date.now() - c.verified.t > VERIFY_TTL_MS),
  )
  if (due.length === 0) return null
  // Highest liquidity first; the unverified before the stale.
  due.sort((a, b) => Number(Boolean(a.verified)) - Number(Boolean(b.verified)) || b.ninjaCount - a.ninjaCount)
  return due[0]
}

/**
 * Verify one candidate against live trade: 1 POST + 2 sample fetches (20
 * cheapest listings). Records p10/p50 of instant-buyout asks and the spread.
 */
export async function verifyOne(session: Session): Promise<string | null> {
  const candidate = await nextToVerify()
  if (!candidate) return null

  const settings = await getSettings()
  const divine = await getDivine()
  const run = await runSearch(session, settings.league, queryFor(candidate.name))

  const chaosPrices: number[] = []
  let sampled = 0
  for (const page of [run.result.slice(0, 10), run.result.slice(10, 20)]) {
    if (page.length === 0) break
    const listings = await sampleListings(session, page, run.id, settings.league)
    for (const l of listings) {
      sampled += 1
      if (!l.instantBuyout) continue
      chaosPrices.push(l.currency === "divine" ? l.amount * divine.rate : l.amount)
    }
  }

  const sorted = [...chaosPrices].sort((a, b) => a - b)
  const p10 = percentile(sorted, 0.1)
  const p50 = percentile(sorted, 0.5)
  const spreadPct = p10 != null && p50 != null && p50 > 0 ? Math.round(((p50 - p10) / p50) * 1000) / 10 : null

  await updateCandidate(candidate.key, {
    verified: {
      t: Date.now(),
      total: run.total,
      sampled,
      p10: p10 == null ? null : Math.round(p10 * 10) / 10,
      p50: p50 == null ? null : Math.round(p50 * 10) / 10,
      spreadPct,
      url: run.id ? tradeSearchUrl(settings.league, run.id) : null,
    },
  })
  return candidate.name
}
