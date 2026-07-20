// The Import tab: list drafts, upload/paste a markdown list to merge in,
// add one manually, or discard everything at once.

import { addSingleDraft, clearDrafts, getDrafts, importDraftsFromMarkdown } from "@/lib/poe/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  return Response.json({ drafts: await getDrafts() })
}

export async function POST(req: Request): Promise<Response> {
  let body: { markdown?: string; itemName?: string; notes?: string; url?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 })
  }

  if (typeof body.markdown === "string") {
    if (!body.markdown.trim()) {
      return Response.json({ ok: false, error: "markdown is required." }, { status: 400 })
    }
    const added = await importDraftsFromMarkdown(body.markdown)
    return Response.json({ ok: true, added, drafts: await getDrafts() })
  }

  if (typeof body.url === "string") {
    if (!body.itemName?.trim()) {
      return Response.json({ ok: false, error: "Name is required." }, { status: 400 })
    }
    const result = await addSingleDraft({
      itemName: body.itemName,
      notes: body.notes ?? "",
      url: body.url,
    })
    if (!result.ok) return Response.json(result, { status: 400 })
    return Response.json({ ok: true, draft: result.draft, drafts: await getDrafts() })
  }

  return Response.json({ ok: false, error: "markdown or (itemName + url) is required." }, { status: 400 })
}

export async function DELETE(): Promise<Response> {
  await clearDrafts()
  return Response.json({ ok: true })
}
