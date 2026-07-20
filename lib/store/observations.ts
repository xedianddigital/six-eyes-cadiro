// Time-series storage without native modules.
//
// SpeedyCadiro's electron-builder config celebrates having "no native modules
// to rebuild against Electron's ABI" — its Next server is forked as a plain
// Node child, and this app keeps that property. So no better-sqlite3; instead:
//
//   .data/series/{internalId}.obs.jsonl   one line per observation *upsert*
//   .data/series/{internalId}.snap.jsonl  one line per poll snapshot
//
// Observations are deduplicated by PoE listing id in memory; the JSONL files
// are append-only during operation and rewritten (compacted) on load and once
// a day, dropping everything past retention. At this app's volumes — a few
// thousand distinct listings and a few hundred snapshots per search per
// retention period — this is small, crash-tolerant (a torn last line loses one
// observation, not the file), and trivially debuggable with `less`.

import { promises as fs } from "node:fs"
import path from "node:path"
import { DATA_DIR } from "@/lib/poe/config"
import type { Observation, Snapshot } from "@/lib/poe/types"

const SERIES_DIR = path.join(DATA_DIR, "series")

interface SeriesState {
  /** listing id -> latest observation */
  observations: Map<string, Observation>
  snapshots: Snapshot[]
  loaded: boolean
  writeChain: Promise<void>
}

const series = new Map<string, SeriesState>()

function stateFor(id: string): SeriesState {
  let s = series.get(id)
  if (!s) {
    s = { observations: new Map(), snapshots: [], loaded: false, writeChain: Promise.resolve() }
    series.set(id, s)
  }
  return s
}

const obsPath = (id: string) => path.join(SERIES_DIR, `${id}.obs.jsonl`)
const snapPath = (id: string) => path.join(SERIES_DIR, `${id}.snap.jsonl`)

async function readLines(file: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(file, "utf8")
    return raw.split("\n").filter(Boolean)
  } catch {
    return []
  }
}

async function ensureLoaded(id: string): Promise<SeriesState> {
  const s = stateFor(id)
  if (s.loaded) return s
  for (const line of await readLines(obsPath(id))) {
    try {
      const obs = JSON.parse(line) as Observation
      if (obs && typeof obs.id === "string") s.observations.set(obs.id, obs)
    } catch {
      // A torn trailing line from a crash; ignore it.
    }
  }
  for (const line of await readLines(snapPath(id))) {
    try {
      const snap = JSON.parse(line) as Snapshot
      if (snap && typeof snap.t === "number") s.snapshots.push(snap)
    } catch {
      // Same.
    }
  }
  s.snapshots.sort((a, b) => a.t - b.t)
  s.loaded = true
  return s
}

function appendLine(s: SeriesState, file: string, line: string): void {
  s.writeChain = s.writeChain.then(async () => {
    await fs.mkdir(SERIES_DIR, { recursive: true })
    await fs.appendFile(file, line + "\n", "utf8")
  })
}

/**
 * Record this poll's sampled listings. Returns how many were *new* (first ever
 * seen), which feeds the new-per-hour metric.
 */
export async function recordObservations(
  id: string,
  seen: { listingId: string; chaos: number; amount: number; currency: "chaos" | "divine" }[],
  now = Date.now(),
): Promise<number> {
  const s = await ensureLoaded(id)
  let fresh = 0
  for (const item of seen) {
    const prev = s.observations.get(item.listingId)
    const obs: Observation = {
      id: item.listingId,
      chaos: item.chaos,
      amount: item.amount,
      currency: item.currency,
      firstSeen: prev?.firstSeen ?? now,
      lastSeen: now,
    }
    if (!prev) fresh += 1
    s.observations.set(item.listingId, obs)
    // Upsert-by-append: on reload, the last line for an id wins because the Map
    // is filled in file order. Compaction collapses the duplicates.
    appendLine(s, obsPath(id), JSON.stringify(obs))
  }
  return fresh
}

export async function recordSnapshot(id: string, snap: Snapshot): Promise<void> {
  const s = await ensureLoaded(id)
  s.snapshots.push(snap)
  appendLine(s, snapPath(id), JSON.stringify(snap))
}

/** Distinct observations last confirmed within the window. */
export async function observationsInWindow(id: string, windowMs: number, now = Date.now()): Promise<Observation[]> {
  const s = await ensureLoaded(id)
  const cutoff = now - windowMs
  const out: Observation[] = []
  for (const obs of s.observations.values()) {
    if (obs.lastSeen >= cutoff) out.push(obs)
  }
  return out
}

export async function snapshotsInWindow(id: string, windowMs: number, now = Date.now()): Promise<Snapshot[]> {
  const s = await ensureLoaded(id)
  const cutoff = now - windowMs
  return s.snapshots.filter((snap) => snap.t >= cutoff)
}

/** Newly-first-seen listings within the window — the turnover proxy. */
export async function newObservationsInWindow(id: string, windowMs: number, now = Date.now()): Promise<number> {
  const s = await ensureLoaded(id)
  const cutoff = now - windowMs
  let n = 0
  for (const obs of s.observations.values()) {
    if (obs.firstSeen >= cutoff) n += 1
  }
  return n
}

/**
 * Rewrite both files keeping only data inside retention. Called on a daily
 * timer and after a series is deleted-and-shrunk. Serialized on the same write
 * chain as appends so a poll can't interleave into a half-written file.
 */
export async function compact(id: string, retentionMs: number, now = Date.now()): Promise<void> {
  const s = await ensureLoaded(id)
  const cutoff = now - retentionMs
  for (const [key, obs] of s.observations) {
    if (obs.lastSeen < cutoff) s.observations.delete(key)
  }
  s.snapshots = s.snapshots.filter((snap) => snap.t >= cutoff)
  const obsBody = [...s.observations.values()].map((o) => JSON.stringify(o)).join("\n")
  const snapBody = s.snapshots.map((o) => JSON.stringify(o)).join("\n")
  s.writeChain = s.writeChain.then(async () => {
    await fs.mkdir(SERIES_DIR, { recursive: true })
    await fs.writeFile(obsPath(id), obsBody ? obsBody + "\n" : "", "utf8")
    await fs.writeFile(snapPath(id), snapBody ? snapBody + "\n" : "", "utf8")
  })
  return s.writeChain
}

/** Delete a series entirely (when the user removes a tracked search). */
export async function dropSeries(id: string): Promise<void> {
  const s = stateFor(id)
  s.observations.clear()
  s.snapshots = []
  s.loaded = true
  s.writeChain = s.writeChain.then(async () => {
    await fs.rm(obsPath(id), { force: true })
    await fs.rm(snapPath(id), { force: true })
  })
  return s.writeChain
}
