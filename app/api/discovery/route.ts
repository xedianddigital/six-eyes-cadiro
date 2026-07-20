// The discovery review queue: list candidates, act on one (track / dismiss / restore).

import { getDiscovery, getSettings, getSession, updateCandidate, addSearch, getSearches } from "@/lib/poe/config"
import { MAX_TRACKED } from "@/lib/poe/types"
import { runSearch, tradeSearchUrl } from "@/lib/poe/poe-client"
import { queryFor } from "@/lib/engine/discovery"
import { logEvent } from "@/lib/store/logs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  const [discovery, settings] = await Promise.all([getDiscovery(), getSettings()])
  const candidates = discovery.candidates
    .filter((c) => !c.dismissed)
    .sort((a, b) => (b.verified?.spreadPct ?? -1) - (a.verified?.spreadPct ?? -1))
  return Response.json({ refreshedAt: discovery.refreshedAt, league: settings.league, candidates })
}

export async function POST(req: Request): Promise<Response> {
  let body: { key?: string; action?: "dismiss" | "restore" | "track" }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 })
  }
  if (!body.key || !body.action) {
    return Response.json({ ok: false, error: "key and action are required." }, { status: 400 })
  }

  if (body.action === "dismiss" || body.action === "restore") {
    const updated = await updateCandidate(body.key, { dismissed: body.action === "dismiss" })
    if (!updated) return Response.json({ ok: false, error: "Unknown candidate." }, { status: 404 })
    await logEvent("discovery", `${body.action === "dismiss" ? "Dismissed" : "Restored"} "${updated.name}"`)
    return Response.json({ ok: true })
  }

  // action === "track": promote a candidate into the tracker.
  //
  // Deliberately does NOT reuse candidate.verified.url's search id: that id
  // was minted by the background verification rotation, possibly up to
  // VERIFY_TTL_MS (12h) before the user clicks "track", and was never
  // rehydrated via a real page GET the way a pasted browser URL has been.
  // Baking a stale/unproven id in as the tracked search's permanent
  // searchId silently broke every future poll for it (first poll's
  // getSavedQuery GET has nothing to rehydrate reliably, so cachedQuery
  // never gets set and the search never prices) — that's the bug behind
  // Discovery-tracked cards showing no price. Minting a fresh id right now,
  // in the same request, and seeding cachedQuery with the exact body that
  // just produced it sidesteps the whole GET-rehydration question.
  const discovery = await getDiscovery()
  const candidate = discovery.candidates.find((c) => c.key === body.key)
  if (!candidate) return Response.json({ ok: false, error: "Unknown candidate." }, { status: 404 })
  if (!candidate.verified?.url) {
    return Response.json(
      { ok: false, error: "Not verified yet — wait for the rotation or open it on the trade site." },
      { status: 400 },
    )
  }
  if ((await getSearches()).length >= MAX_TRACKED) {
    return Response.json({ ok: false, error: `Tracking is capped at ${MAX_TRACKED} searches.` }, { status: 400 })
  }
  const session = await getSession()
  if (!session) {
    return Response.json({ ok: false, error: "Sign in first — tracking needs a live search." }, { status: 400 })
  }
  const settings = await getSettings()
  const query = queryFor(candidate.name)
  let run
  try {
    run = await runSearch(session, settings.league, query)
  } catch (err) {
    return Response.json(
      { ok: false, error: `Could not start tracking: ${(err as Error).message}` },
      { status: 502 },
    )
  }
  if (!run.id) {
    return Response.json({ ok: false, error: "GGG didn't return a search id." }, { status: 502 })
  }
  const search = await addSearch({
    url: tradeSearchUrl(settings.league, run.id),
    league: settings.league,
    searchId: run.id,
    title: candidate.name,
    notes: "",
    active: true,
    cachedQuery: query,
    lastPolledAt: 0,
    lastError: null,
  })
  await logEvent("track", `Tracked "${candidate.name}" from Discovery`)
  return Response.json({ ok: true, search })
}
