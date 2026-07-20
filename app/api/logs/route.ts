// Read the activity log. Nothing here writes — every write is a side effect
// of the action it's logging, called from that action's own route/job.
//
// Paged and, by default, bounded to the dashboard's configured windowHours —
// without that bound this would render the app's entire history as one
// ever-growing page. Pass ?hours=0 (or omit the bound entirely client-side by
// requesting a very large value) to page back further than the window.

import { getLogs } from "@/lib/store/logs"
import { getSettings } from "@/lib/poe/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const settings = await getSettings()

  const hoursParam = url.searchParams.get("hours")
  const hours = hoursParam != null ? Number(hoursParam) : settings.windowHours
  const sinceT = Number.isFinite(hours) && hours > 0 ? Date.now() - hours * 3600_000 : undefined

  const beforeParam = url.searchParams.get("before")
  const beforeT = beforeParam != null ? Number(beforeParam) : undefined

  const page = await getLogs({ sinceT, beforeT: Number.isFinite(beforeT) ? beforeT : undefined, limit: 25 })
  return Response.json({ ...page, windowHours: settings.windowHours })
}
