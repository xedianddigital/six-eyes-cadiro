// The dashboard's main read, and the underlying "create a tracked search"
// primitive (used by draft promotion and discovery's track action — the
// dashboard UI itself only ever adds through the Import tab now).

import { addSearch, getDivine, getSearches, getSettings } from "@/lib/poe/config"
import { parseTradeUrl } from "@/lib/poe/parse-url"
import { statsFor } from "@/lib/engine/tracker"
import { scheduler } from "@/lib/engine/scheduler"
import { logEvent } from "@/lib/store/logs"
import { MAX_TRACKED } from "@/lib/poe/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  const [settings, searches, divine] = await Promise.all([getSettings(), getSearches(), getDivine()])
  const cards = await Promise.all(
    searches.map(async (s) => ({
      id: s.id,
      title: s.title,
      notes: s.notes,
      url: s.url,
      league: s.league,
      searchId: s.searchId,
      active: s.active,
      lastPolledAt: s.lastPolledAt,
      lastError: s.lastError,
      stats: await statsFor(s.id, settings.windowHours),
    })),
  )
  return Response.json({
    cards,
    windowHours: settings.windowHours,
    divine,
    scheduler: scheduler.getStatus(),
    maxTracked: MAX_TRACKED,
  })
}

export async function POST(req: Request): Promise<Response> {
  let body: { url?: string; title?: string; notes?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 })
  }

  const parsed = parseTradeUrl(body.url ?? "")
  if (!parsed) {
    return Response.json(
      { ok: false, error: "Not a trade search URL. Expected …/trade/search/{league}/{id}." },
      { status: 400 },
    )
  }

  const existing = await getSearches()
  if (existing.length >= MAX_TRACKED) {
    return Response.json(
      { ok: false, error: `Tracking is capped at ${MAX_TRACKED} searches to keep polling calm.` },
      { status: 400 },
    )
  }

  const search = await addSearch({
    url: body.url!.trim(),
    league: parsed.league,
    searchId: parsed.searchId,
    title: body.title?.trim() || `${parsed.league} · ${parsed.searchId.slice(0, 8)}`,
    notes: body.notes?.trim() ?? "",
    active: true,
    cachedQuery: null,
    lastPolledAt: 0,
    lastError: null,
  })
  await logEvent("tracked", `Added "${search.title}"`)
  return Response.json({ ok: true, search })
}
