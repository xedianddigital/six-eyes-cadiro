// The discovery review queue: list candidates, act on one (dismiss / restore).
//
// There is deliberately no "track" action here anymore. It existed through
// 0.6.1 (mint a fresh generated search, add it straight to Dashboard) but
// every generated query — however it was built — kept opening on the real
// trade site with "Sale type: In-person only" selected, contradicting this
// app's instant-buyout-only premise; see CLAUDE.md's history on this for the
// two prior attempts. Rather than keep guessing at GGG's filter schema, the
// workflow is now manual end to end: "open" gives a real (if imperfect)
// starting point on the trade site, the user fixes the sale-type filter (and
// adds any mod/price ranges they want — often exactly what a name-only
// generated search can't express anyway) by hand, and pastes the corrected
// URL into Import like any other search. Discovery's job stays "surface
// candidates worth a look," not "produce a search ready to poll unattended."

import { getDiscovery, getSettings, updateCandidate } from "@/lib/poe/config"
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
  let body: { key?: string; action?: "dismiss" | "restore" }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 })
  }
  if (!body.key || !body.action) {
    return Response.json({ ok: false, error: "key and action are required." }, { status: 400 })
  }

  const updated = await updateCandidate(body.key, { dismissed: body.action === "dismiss" })
  if (!updated) return Response.json({ ok: false, error: "Unknown candidate." }, { status: 404 })
  await logEvent("discovery", `${body.action === "dismiss" ? "Dismissed" : "Restored"} "${updated.name}"`)
  return Response.json({ ok: true })
}
