// Read, save and clear the stored PoE session. GET never returns cookie
// values — only whether each is present, plus a live validation result.
// Lifted from SpeedyCadiro; the only change is notifying the scheduler
// instead of the live engine.

import { clearSession, getSession, saveSession } from "@/lib/poe/config"
import { validateSession } from "@/lib/poe/poe-client"
import { scheduler } from "@/lib/engine/scheduler"
import type { Session } from "@/lib/poe/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  const session = await getSession()
  if (!session) {
    return Response.json({ configured: false })
  }

  const validation = await validateSession(session)
  return Response.json({
    configured: true,
    valid: validation.ok,
    reason: validation.reason,
    account: validation.account,
    userAgent: session.userAgent,
    updatedAt: session.updatedAt,
    has: {
      poesessid: Boolean(session.poesessid),
      poetoken: Boolean(session.poetoken),
      cfClearance: Boolean(session.cfClearance),
    },
  })
}

export async function POST(req: Request): Promise<Response> {
  let body: Partial<Session> & { trustUserAgent?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 })
  }

  const poesessid = body.poesessid?.trim()
  if (!poesessid) {
    return Response.json({ ok: false, error: "POESESSID is required." }, { status: 400 })
  }

  // cf_clearance is bound to the User-Agent of the browser that earned it; the
  // in-app login supplies the matching agent.
  const session: Session = {
    poesessid,
    poetoken: body.poetoken?.trim() ?? "",
    cfClearance: body.cfClearance?.trim() ?? "",
    userAgent: body.userAgent?.trim() ?? "",
    updatedAt: Date.now(),
  }

  const validation = await validateSession(session)
  await saveSession(session)
  scheduler.sessionChanged()

  return Response.json({ ok: true, valid: validation.ok, reason: validation.reason })
}

export async function DELETE(): Promise<Response> {
  await clearSession()
  scheduler.sessionChanged()
  return Response.json({ ok: true })
}
