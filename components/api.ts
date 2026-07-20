// Client-side view models and fetch helpers. The UI refreshes by polling its
// own local server once a minute — the data underneath changes every 15–20
// minutes, so SSE/websockets would be machinery without a payoff.

import type { SearchStats } from "@/lib/poe/types"

export interface CardModel {
  id: string
  title: string
  notes: string
  url: string
  league: string
  searchId: string
  active: boolean
  lastPolledAt: number
  lastError: string | null
  stats: SearchStats
}

export interface SchedulerModel {
  running: boolean
  state: string
  lastJob: string | null
  lastJobAt: number
  sessionValid: boolean | null
  limiter: { spacingMs: number; worstUsage: number; restrictedForSec: number }
}

export interface DashboardModel {
  cards: CardModel[]
  windowHours: number
  divine: { rate: number; source: "ninja" | "manual"; updatedAt: number }
  scheduler: SchedulerModel
  maxTracked: number
}

export interface CandidateModel {
  key: string
  name: string
  ninjaType: string
  ninjaChaos: number
  ninjaCount: number
  dismissed: boolean
  verified: null | {
    t: number
    total: number
    sampled: number
    p10: number | null
    p50: number | null
    spreadPct: number | null
    url: string | null
  }
}

export interface DraftModel {
  key: string
  itemName: string
  variant: string
  notes: string
  url: string
  league: string
  searchId: string
  addedAt: number
}

export interface LogEntryModel {
  t: number
  level: "info" | "warn" | "error"
  kind: string
  message: string
}

export interface SettingsModel {
  league: string
  pollIntervalMin: number
  windowHours: number
  retentionDays: number
  fetchPages: number
  discoveryPerHour: number
  manualDivineRate: number
  useNinjaRate: boolean
  coordinationHoldSec: number
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`${res.status} from ${url}`)
  return (await res.json()) as T
}

export async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok) throw new Error(data?.error ?? `${res.status} from ${url}`)
  return data as T
}

export function ago(t: number): string {
  if (!t) return "never"
  const mins = Math.floor((Date.now() - t) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Mandatory, unambiguous 24h timestamp for the Logs tab — never a relative "Xm ago". */
export function clockTime(t: number): string {
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function chaosText(v: number | null): string {
  if (v == null) return "—"
  return v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
}

/**
 * Divine-orb equivalent of a chaos price, e.g. 120c at a 171c rate reads as
 * "0.7d". Always exactly one decimal below 10 divine (never "0.04" — round
 * to "0.0" rather than show a second digit) so it stays visually secondary
 * to the chaos figure. Null when there's no price yet or no divine rate to
 * convert with (rate not loaded, or configured to 0).
 */
export function divineText(chaos: number | null, divineRate: number): string | null {
  if (chaos == null || !divineRate) return null
  const d = chaos / divineRate
  if (d >= 10) return String(Math.round(d))
  return d.toFixed(1)
}
