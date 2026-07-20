// poe.ninja client — the discovery universe and the divine:chaos rate.
//
// poe.ninja publishes aggregated economy data and is the community-standard
// source for baselines. It is NOT pathofexile.com: requests here do not touch
// GGG's rate budget at all. Still, be a good citizen — their data updates on
// the order of tens of minutes, so this client refuses to call any endpoint
// more than once per REFRESH_FLOOR_MS and callers cache on top of that.

const NINJA_BASE = "https://poe.ninja/api/data"
const REFRESH_FLOOR_MS = 10 * 60 * 1000

const lastCall = new Map<string, number>()

async function ninjaJson<T>(url: string): Promise<T | null> {
  const prev = lastCall.get(url) ?? 0
  if (Date.now() - prev < REFRESH_FLOOR_MS) return null
  lastCall.set(url, Date.now())
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "six-eyes-cadiro/0.1 (market dashboard)" },
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// ---- Divine rate ----

interface CurrencyOverview {
  lines?: { currencyTypeName?: string; chaosEquivalent?: number }[]
}

/** chaos per divine, or null when unavailable/too soon to re-ask. */
export async function fetchDivineRate(league: string): Promise<number | null> {
  const url = `${NINJA_BASE}/currencyoverview?league=${encodeURIComponent(league)}&type=Currency`
  const data = await ninjaJson<CurrencyOverview>(url)
  const line = data?.lines?.find((l) => l.currencyTypeName === "Divine Orb")
  const rate = line?.chaosEquivalent
  return typeof rate === "number" && rate > 0 ? rate : null
}

// ---- Discovery universe ----

export interface NinjaItem {
  key: string
  name: string
  ninjaType: string
  chaosValue: number
  /** poe.ninja's listing count — their liquidity signal. */
  count: number
}

interface ItemOverview {
  lines?: {
    detailsId?: string
    name?: string
    chaosValue?: number
    count?: number
    listingCount?: number
    // Variant/links noise we deliberately ignore for candidate generation.
  }[]
}

/**
 * The unique-item classes worth flipping. Maps, gems and cluster jewels are
 * excluded on purpose: their value axes (tier, level/quality, passives) don't
 * survive a name-only trade search, so a candidate row would be misleading.
 */
const UNIQUE_TYPES = [
  "UniqueWeapon",
  "UniqueArmour",
  "UniqueAccessory",
  "UniqueJewel",
  "UniqueFlask",
] as const

export async function fetchUniqueUniverse(league: string): Promise<NinjaItem[]> {
  const out: NinjaItem[] = []
  for (const type of UNIQUE_TYPES) {
    const url = `${NINJA_BASE}/itemoverview?league=${encodeURIComponent(league)}&type=${type}`
    const data = await ninjaJson<ItemOverview>(url)
    for (const line of data?.lines ?? []) {
      if (!line.name || typeof line.chaosValue !== "number") continue
      const count = line.listingCount ?? line.count ?? 0
      out.push({
        key: `${type}:${line.detailsId ?? line.name}`,
        name: line.name,
        ninjaType: type,
        chaosValue: line.chaosValue,
        count,
      })
    }
  }
  // The same unique can appear once per variant; keep the most-listed line.
  const byName = new Map<string, NinjaItem>()
  for (const item of out) {
    const prev = byName.get(item.name)
    if (!prev || item.count > prev.count) byName.set(item.name, item)
  }
  return [...byName.values()]
}
