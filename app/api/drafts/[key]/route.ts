// Promote one draft into a real tracked search, or discard it unpromoted.

import { addSearch, getDraft, getSearches, removeDraft } from "@/lib/poe/config"
import { MAX_TRACKED } from "@/lib/poe/types"
import { logEvent } from "@/lib/store/logs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await ctx.params
  const draft = await getDraft(key)
  if (!draft) return Response.json({ ok: false, error: "Unknown draft." }, { status: 404 })

  if ((await getSearches()).length >= MAX_TRACKED) {
    return Response.json(
      { ok: false, error: `Tracking is capped at ${MAX_TRACKED} searches.` },
      { status: 400 },
    )
  }

  const search = await addSearch({
    url: draft.url,
    league: draft.league,
    searchId: draft.searchId,
    title: draft.variant && draft.variant.toLowerCase() !== "any"
      ? `${draft.itemName} · ${draft.variant}`
      : draft.itemName,
    notes: draft.notes,
    active: true,
    cachedQuery: null,
    lastPolledAt: 0,
    lastError: null,
  })
  await removeDraft(key)
  await logEvent("import", `Promoted "${search.title}" to tracked`)
  return Response.json({ ok: true, search })
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await ctx.params
  const draft = await getDraft(key)
  if (!draft) return Response.json({ ok: false, error: "Unknown draft." }, { status: 404 })
  await removeDraft(key)
  await logEvent("import", `Discarded draft "${draft.itemName}"`)
  return Response.json({ ok: true })
}
