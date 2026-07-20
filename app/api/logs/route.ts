// Read the activity log. Nothing here writes — every write is a side effect
// of the action it's logging, called from that action's own route/job.

import { getLogs } from "@/lib/store/logs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  return Response.json({ logs: await getLogs(500) })
}
