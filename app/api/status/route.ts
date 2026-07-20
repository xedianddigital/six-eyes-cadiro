// Scheduler heartbeat for the header strip.

import { scheduler } from "@/lib/engine/scheduler"
import { getDivine } from "@/lib/poe/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  return Response.json({ scheduler: scheduler.getStatus(), divine: await getDivine() })
}
