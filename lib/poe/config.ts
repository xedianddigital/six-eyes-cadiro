// Local, file-based persistence. Everything (including your PoE session
// cookies) is stored ONLY on your machine in `.data/config.json`, which is
// gitignored. Nothing is sent anywhere except pathofexile.com and poe.ninja.
//
// Lifted from SpeedyCadiro's config store; only the entities differ.

import { promises as fs } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import {
  type AppConfig,
  type Session,
  type Settings,
  type TrackedSearch,
  type DiscoveryCandidate,
  type DraftSearch,
  DEFAULT_SETTINGS,
} from "./types"
import { parseDraftMarkdown } from "../import"
import { parseTradeUrl } from "./parse-url"

// Packaged desktop builds install to a read-only directory, so Electron passes
// a writable per-user path here. Falls back to ./.data for `pnpm dev`.
export const DATA_DIR = process.env.POE_DATA_DIR
  ? path.resolve(process.env.POE_DATA_DIR)
  : path.join(process.cwd(), ".data")
const CONFIG_PATH = path.join(DATA_DIR, "config.json")

const EMPTY_CONFIG: AppConfig = {
  session: null,
  searches: [],
  settings: DEFAULT_SETTINGS,
  discovery: { refreshedAt: 0, candidates: [] },
  divine: { rate: DEFAULT_SETTINGS.manualDivineRate, source: "manual", updatedAt: 0 },
  drafts: [],
}

let cache: AppConfig | null = null
let writeChain: Promise<void> = Promise.resolve()

async function readConfig(): Promise<AppConfig> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8")
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    cache = {
      session: parsed.session ?? null,
      searches: parsed.searches ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      discovery: parsed.discovery ?? { refreshedAt: 0, candidates: [] },
      divine: parsed.divine ?? structuredClone(EMPTY_CONFIG.divine),
      drafts: parsed.drafts ?? [],
    }
  } catch {
    cache = structuredClone(EMPTY_CONFIG)
  }
  return cache
}

/**
 * Adds parsed entries as drafts, skipping URLs already drafted or tracked.
 * No entries ship pre-seeded — anything in the Import tab is either uploaded
 * by the user or added one at a time (see addSingleDraft), never bundled
 * with the app itself; this is public/open-source and the owner's own picks
 * aren't everyone's.
 */
function mergeDrafts(
  config: AppConfig,
  entries: { itemName: string; variant: string; notes: string; url: string }[],
): number {
  const known = new Set([...config.drafts.map((d) => d.url), ...config.searches.map((s) => s.url)])
  let added = 0
  for (const entry of entries) {
    if (known.has(entry.url)) continue
    const parsed = parseTradeUrl(entry.url)
    if (!parsed) continue
    known.add(entry.url)
    config.drafts.push({
      key: randomUUID(),
      itemName: entry.itemName,
      variant: entry.variant,
      notes: entry.notes,
      url: entry.url,
      league: parsed.league,
      searchId: parsed.searchId,
      addedAt: Date.now(),
    })
    added += 1
  }
  return added
}

async function persist(): Promise<void> {
  const snapshot = cache ? JSON.stringify(cache, null, 2) : JSON.stringify(EMPTY_CONFIG, null, 2)
  // Serialize writes so concurrent requests don't corrupt the file.
  writeChain = writeChain.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true })
    await fs.writeFile(CONFIG_PATH, snapshot, "utf8")
  })
  return writeChain
}

// ---- Session ----

export async function getSession(): Promise<Session | null> {
  return (await readConfig()).session
}

export async function saveSession(session: Session): Promise<void> {
  const config = await readConfig()
  config.session = session
  await persist()
}

export async function clearSession(): Promise<void> {
  const config = await readConfig()
  config.session = null
  await persist()
}

// ---- Tracked searches ----

export async function getSearches(): Promise<TrackedSearch[]> {
  return (await readConfig()).searches
}

export async function addSearch(
  input: Omit<TrackedSearch, "id" | "createdAt">,
): Promise<TrackedSearch> {
  const config = await readConfig()
  const existing = config.searches.find(
    (s) => s.searchId === input.searchId && s.league === input.league,
  )
  if (existing) {
    Object.assign(existing, input)
    await persist()
    return existing
  }
  const search: TrackedSearch = { id: randomUUID(), createdAt: Date.now(), ...input }
  config.searches.push(search)
  await persist()
  return search
}

export async function updateSearch(
  id: string,
  patch: Partial<Omit<TrackedSearch, "id">>,
): Promise<TrackedSearch | null> {
  const config = await readConfig()
  const search = config.searches.find((s) => s.id === id)
  if (!search) return null
  Object.assign(search, patch)
  await persist()
  return search
}

export async function removeSearch(id: string): Promise<void> {
  const config = await readConfig()
  config.searches = config.searches.filter((s) => s.id !== id)
  await persist()
}

// ---- Settings ----

export async function getSettings(): Promise<Settings> {
  return (await readConfig()).settings
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const config = await readConfig()
  config.settings = { ...config.settings, ...patch }
  await persist()
  return config.settings
}

// ---- Discovery ----

export async function getDiscovery(): Promise<AppConfig["discovery"]> {
  return (await readConfig()).discovery
}

export async function saveDiscovery(
  patch: Partial<AppConfig["discovery"]>,
): Promise<AppConfig["discovery"]> {
  const config = await readConfig()
  config.discovery = { ...config.discovery, ...patch }
  await persist()
  return config.discovery
}

export async function updateCandidate(
  key: string,
  patch: Partial<DiscoveryCandidate>,
): Promise<DiscoveryCandidate | null> {
  const config = await readConfig()
  const candidate = config.discovery.candidates.find((c) => c.key === key)
  if (!candidate) return null
  Object.assign(candidate, patch)
  await persist()
  return candidate
}

// ---- Import drafts ----

export async function getDrafts(): Promise<DraftSearch[]> {
  return (await readConfig()).drafts
}

/** Parse and merge a pasted/uploaded markdown draft list. Returns how many were new. */
export async function importDraftsFromMarkdown(text: string): Promise<number> {
  const config = await readConfig()
  const added = mergeDrafts(config, parseDraftMarkdown(text))
  if (added > 0) await persist()
  return added
}

/** Add one manually-entered draft (the Import tab's "add single item" form). */
export async function addSingleDraft(input: {
  itemName: string
  notes: string
  url: string
}): Promise<{ ok: true; draft: DraftSearch } | { ok: false; error: string }> {
  const parsed = parseTradeUrl(input.url)
  if (!parsed) return { ok: false, error: "Not a trade search URL. Expected …/trade/search/{league}/{id}." }
  const config = await readConfig()
  const known = new Set([...config.drafts.map((d) => d.url), ...config.searches.map((s) => s.url)])
  if (known.has(input.url.trim())) return { ok: false, error: "Already tracked or drafted." }
  const draft: DraftSearch = {
    key: randomUUID(),
    itemName: input.itemName.trim(),
    variant: "",
    notes: input.notes.trim(),
    url: input.url.trim(),
    league: parsed.league,
    searchId: parsed.searchId,
    addedAt: Date.now(),
  }
  config.drafts.push(draft)
  await persist()
  return { ok: true, draft }
}

export async function getDraft(key: string): Promise<DraftSearch | null> {
  return (await getDrafts()).find((d) => d.key === key) ?? null
}

/** Discard every current draft in one action. */
export async function clearDrafts(): Promise<void> {
  const config = await readConfig()
  config.drafts = []
  await persist()
}

export async function removeDraft(key: string): Promise<void> {
  const config = await readConfig()
  config.drafts = config.drafts.filter((d) => d.key !== key)
  await persist()
}

// ---- Divine rate ----

export async function getDivine(): Promise<AppConfig["divine"]> {
  return (await readConfig()).divine
}

export async function saveDivine(divine: AppConfig["divine"]): Promise<void> {
  const config = await readConfig()
  config.divine = divine
  await persist()
}

export async function getConfig(): Promise<AppConfig> {
  return readConfig()
}
