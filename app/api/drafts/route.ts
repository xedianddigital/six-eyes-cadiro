// The Import tab: list drafts, upload/paste a markdown list to merge in.

import { getDrafts, importDraftsFromMarkdown } from "@/lib/poe/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  return Response.json({ drafts: await getDrafts() })
}

export async function POST(req: Request): Promise<Response> {
  let body: { markdown?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 })
  }
  if (typeof body.markdown !== "string" || !body.markdown.trim()) {
    return Response.json({ ok: false, error: "markdown is required." }, { status: 400 })
  }
  const added = await importDraftsFromMarkdown(body.markdown)
  return Response.json({ ok: true, added, drafts: await getDrafts() })
}
