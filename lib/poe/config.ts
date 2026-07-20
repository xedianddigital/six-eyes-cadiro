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
  DEFAULT_SETTINGS,
} from "./types"

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
    }
  } catch {
    cache = structuredClone(EMPTY_CONFIG)
  }
  return cache
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
