// Rename, pause/resume, or remove one tracked search.

import { getSearches, removeSearch, updateSearch } from "@/lib/poe/config"
import { dropSeries } from "@/lib/store/observations"
import { logEvent } from "@/lib/store/logs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params
  let body: { title?: string; notes?: string; active?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 })
  }
  const patch: { title?: string; notes?: string; active?: boolean } = {}
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim()
  if (typeof body.notes === "string") patch.notes = body.notes.trim()
  if (typeof body.active === "boolean") patch.active = body.active
  const search = await updateSearch(id, patch)
  if (!search) return Response.json({ ok: false, error: "Unknown search." }, { status: 404 })
  if (typeof patch.active === "boolean") {
    await logEvent("tracked", `${patch.active ? "Resumed" : "Paused"} "${search.title}"`)
  }
  if (typeof patch.title === "string") {
    await logEvent("tracked", `Renamed a tracked search to "${patch.title}"`)
  }
  return Response.json({ ok: true, search })
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params
  const search = (await getSearches()).find((s) => s.id === id)
  if (!search) return Response.json({ ok: false, error: "Unknown search." }, { status: 404 })
  await removeSearch(id)
  await dropSeries(id)
  await logEvent("tracked", `Removed "${search.title}" and its history`)
  return Response.json({ ok: true })
}
