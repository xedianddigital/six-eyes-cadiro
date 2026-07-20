// Courtesy coordination with SpeedyCadiro.
//
// Both apps share GGG's per-account/per-IP rate budget, and the one request
// that must never queue behind an analyzer poll is a snipe. SpeedyCadiro picks
// a random localhost port at startup, so probing it is a dead end; instead it
// can drop a timestamp file on each travel and this app simply holds its queue
// for a short window after any recent travel. See
// docs/speedy-cadiro-coordination-patch.md for the 5-line patch on that side.
//
// Fail-open by design: no file, unreadable file, SpeedyCadiro not installed —
// all mean "no hold". The analyzer's own pacing is already conservative enough
// that this is belt-and-suspenders, not a load-bearing safety.

import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"

interface Activity {
  travelAt?: number
}

function candidatePaths(): string[] {
  const home = os.homedir()
  const roots: string[] = []
  if (process.env.APPDATA) roots.push(path.join(process.env.APPDATA, "speedy-cadiro"))
  roots.push(path.join(home, ".config", "speedy-cadiro"))
  return roots.map((r) => path.join(r, "data", "activity.json"))
}

let cached: { at: number; travelAt: number } | null = null

/** Unix ms of SpeedyCadiro's most recent travel, or 0. Re-read at most every 5s. */
async function lastTravelAt(): Promise<number> {
  if (cached && Date.now() - cached.at < 5000) return cached.travelAt
  let travelAt = 0
  for (const file of candidatePaths()) {
    try {
      const raw = await fs.readFile(file, "utf8")
      const parsed = JSON.parse(raw) as Activity
      if (typeof parsed.travelAt === "number") travelAt = Math.max(travelAt, parsed.travelAt)
    } catch {
      // Absent or unreadable — fail open.
    }
  }
  cached = { at: Date.now(), travelAt }
  return travelAt
}

/** How long the analyzer should keep holding, in ms. 0 = go ahead. */
export async function coordinationHoldMs(holdSec: number): Promise<number> {
  if (holdSec <= 0) return 0
  const travelAt = await lastTravelAt()
  if (!travelAt) return 0
  const until = travelAt + holdSec * 1000
  return Math.max(0, until - Date.now())
}
