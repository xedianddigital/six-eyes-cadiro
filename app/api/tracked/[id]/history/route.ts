// Full snapshot history for one search's expanded graph.

import { snapshotsInWindow } from "@/lib/store/observations"
import { getSettings } from "@/lib/poe/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params
  const url = new URL(req.url)
  const hours = Number(url.searchParams.get("hours"))
  const windowHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 24 * 30) : (await getSettings()).windowHours
  const snapshots = await snapshotsInWindow(id, windowHours * 3600_000)
  return Response.json({ windowHours, snapshots })
}
