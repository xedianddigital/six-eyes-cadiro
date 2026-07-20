// Activity log: every poll and every user action that changes state, so the
// owner can see what the app actually did without cross-referencing
// timestamps against their own memory. Bounded, append-only JSONL, same
// pattern as lib/store/observations.ts — no native modules.

import { promises as fs } from "node:fs"
import path from "node:path"
import { DATA_DIR } from "@/lib/poe/config"

const LOG_PATH = path.join(DATA_DIR, "logs.jsonl")
/** Keep this many most-recent entries. Trimmed on load and periodically on write. */
const MAX_LOGS = 2000

export type LogLevel = "info" | "warn" | "error"

export interface LogEntry {
  t: number
  level: LogLevel
  kind: string
  message: string
}

let cache: LogEntry[] | null = null
let writeChain: Promise<void> = Promise.resolve()

async function ensureLoaded(): Promise<LogEntry[]> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(LOG_PATH, "utf8")
    const entries: LogEntry[] = []
    for (const line of raw.split("\n")) {
      if (!line) continue
      try {
        const e = JSON.parse(line) as LogEntry
        if (e && typeof e.t === "number") entries.push(e)
      } catch {
        // Torn trailing line from a crash; ignore it.
      }
    }
    cache = entries.slice(-MAX_LOGS)
  } catch {
    cache = []
  }
  return cache
}

function persist(entries: LogEntry[]): void {
  const body = entries.map((e) => JSON.stringify(e)).join("\n")
  writeChain = writeChain.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true })
    await fs.writeFile(LOG_PATH, body ? body + "\n" : "", "utf8")
  })
}

/** Record one event. Never throws — a logging failure must not break the action it's logging. */
export async function logEvent(kind: string, message: string, level: LogLevel = "info"): Promise<void> {
  try {
    const entries = await ensureLoaded()
    entries.push({ t: Date.now(), level, kind, message })
    if (entries.length > MAX_LOGS) entries.splice(0, entries.length - MAX_LOGS)
    persist(entries)
  } catch {
    // Logging is best-effort.
  }
}

export interface LogPage {
  entries: LogEntry[]
  /** True if there are older entries beyond this page (within sinceT, if set). */
  hasMore: boolean
}

/**
 * Most recent entries first, paged.
 *
 * `sinceT` bounds how far back results go (the caller passes the dashboard's
 * configured windowHours by default so Logs doesn't default to rendering the
 * app's entire history as one endless page); `beforeT` is the pagination
 * cursor — pass the oldest `t` from the previous page to fetch the next
 * older page. Filtering happens after reversing so `hasMore` reflects
 * whether there's anything left within the same sinceT bound, not the whole
 * unbounded log.
 */
export async function getLogs(opts: { sinceT?: number; beforeT?: number; limit?: number } = {}): Promise<LogPage> {
  const { sinceT, beforeT, limit = 100 } = opts
  const all = await ensureLoaded()
  let newestFirst = [...all].reverse()
  if (sinceT != null) newestFirst = newestFirst.filter((e) => e.t >= sinceT)
  if (beforeT != null) newestFirst = newestFirst.filter((e) => e.t < beforeT)
  return {
    entries: newestFirst.slice(0, limit),
    hasMore: newestFirst.length > limit,
  }
}
