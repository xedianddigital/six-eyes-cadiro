// Rename, pause/resume, or remove one tracked search.

import { getSearches, removeSearch, updateSearch } from "@/lib/poe/config"
import { dropSeries } from "@/lib/store/observations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params
  let body: { title?: string; active?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 })
  }
  const patch: { title?: string; active?: boolean } = {}
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim()
  if (typeof body.active === "boolean") patch.active = body.active
  const search = await updateSearch(id, patch)
  if (!search) return Response.json({ ok: false, error: "Unknown search." }, { status: 404 })
  return Response.json({ ok: true, search })
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params
  const known = (await getSearches()).some((s) => s.id === id)
  if (!known) return Response.json({ ok: false, error: "Unknown search." }, { status: 404 })
  await removeSearch(id)
  await dropSeries(id)
  return Response.json({ ok: true })
}
