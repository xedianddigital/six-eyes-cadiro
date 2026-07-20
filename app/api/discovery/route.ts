// The discovery review queue: list candidates, act on one (track / dismiss / restore).

import { getDiscovery, getSettings, updateCandidate, addSearch, getSearches } from "@/lib/poe/config"
import { MAX_TRACKED } from "@/lib/poe/types"
import { parseTradeUrl } from "@/lib/poe/parse-url"

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
    return Response.json({ ok: true })
  }

  // action === "track": promote the verified search URL into the tracker.
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
  const parsed = parseTradeUrl(candidate.verified.url)
  if (!parsed) return Response.json({ ok: false, error: "Stored URL is not parseable." }, { status: 500 })
  const search = await addSearch({
    url: candidate.verified.url,
    league: parsed.league,
    searchId: parsed.searchId,
    title: candidate.name,
    active: true,
    cachedQuery: null,
    lastPolledAt: 0,
    lastError: null,
  })
  return Response.json({ ok: true, search })
}
