// Thin authenticated client for pathofexile.com. Acts as "you": sends the three
// cookies (POESESSID, POETOKEN, cf_clearance) plus the matching browser
// User-Agent that Cloudflare's cf_clearance is bound to.
//
// Unlike SpeedyCadiro, NOTHING here is urgent: every single request goes
// through the paced limiter queue. There is no whisper, no travel, no write of
// any kind against GGG — this client only reads listings, slowly.

import type { Session } from "./types"
import { decodeWhisperToken } from "./jwt"
import { rateLimiter } from "./rate-limit"

const BASE = "https://www.pathofexile.com"

export class SessionError extends Error {}
export class CloudflareError extends Error {}
export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfterMs: number,
  ) {
    super(message)
  }
}

function cookieHeader(session: Session): string {
  const parts = [`POESESSID=${session.poesessid}`]
  if (session.poetoken) parts.push(`POETOKEN=${session.poetoken}`)
  if (session.cfClearance) parts.push(`cf_clearance=${session.cfClearance}`)
  return parts.join("; ")
}

function baseHeaders(session: Session, referer?: string): Record<string, string> {
  return {
    "User-Agent": session.userAgent || "six-eyes-cadiro/0.1",
    Cookie: cookieHeader(session),
    Accept: "application/json",
    Origin: BASE,
    Referer: referer ?? `${BASE}/trade`,
    "X-Requested-With": "XMLHttpRequest",
  }
}

function detectAuthFailure(status: number, body: string): void {
  if (status === 401) throw new SessionError("POESESSID expired or invalid (401).")
  if (status === 403) {
    // Cloudflare challenges usually return HTML, not JSON.
    if (/cloudflare|cf-|just a moment|challenge/i.test(body) && !body.trim().startsWith("{")) {
      throw new CloudflareError("Cloudflare blocked the request (403). Sign in again to refresh cf_clearance.")
    }
    throw new SessionError("Forbidden (403) — session likely expired.")
  }
}

/**
 * Every call to pathofexile.com goes through here: paced by the shared limiter
 * and fed back into it so the published budget drives the next call's timing.
 */
async function paced(url: string, init: RequestInit): Promise<Response> {
  return rateLimiter.schedule(async () => {
    const res = await fetch(url, init)
    rateLimiter.observe(res)
    return res
  })
}

function retryAfterMs(res: Response): number {
  const retryAfter = res.headers.get("Retry-After")
  if (retryAfter) {
    const secs = Number(retryAfter)
    if (!Number.isNaN(secs)) return Math.max(1000, secs * 1000)
  }
  return 60_000
}

async function pacedJson<T>(url: string, session: Session, init: RequestInit, referer?: string): Promise<T> {
  const res = await paced(url, {
    ...init,
    headers: { ...baseHeaders(session, referer), ...(init.headers ?? {}) },
    cache: "no-store",
  })
  const text = await res.text()
  if (res.status === 429) {
    const wait = retryAfterMs(res)
    rateLimiter.penalise(wait)
    throw new RateLimitError(`Rate limited (${url.slice(BASE.length, BASE.length + 40)}…).`, wait)
  }
  detectAuthFailure(res.status, text)
  if (!res.ok) throw new Error(`${res.status} from ${url.slice(BASE.length)}: ${text.slice(0, 160)}`)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new CloudflareError("Non-JSON response (possible Cloudflare challenge).")
  }
}

/**
 * Validate that the session is genuinely logged in. Copied from SpeedyCadiro —
 * /my-account redirects to /login unless actually authenticated, whereas the
 * public trade endpoints happily answer guests and would report every session
 * as valid.
 */
export async function validateSession(session: Session): Promise<{ ok: boolean; account?: string; reason?: string }> {
  try {
    const res = await paced(`${BASE}/my-account`, {
      headers: { ...baseHeaders(session, `${BASE}/`), Accept: "text/html" },
      redirect: "manual",
      cache: "no-store",
    })

    if (res.status === 0 || (res.status >= 300 && res.status < 400)) {
      return { ok: false, reason: "Not logged in — the session is a guest or has expired." }
    }
    if (res.status === 401) return { ok: false, reason: "Session expired." }
    if (res.status === 403) {
      return { ok: false, reason: "Cloudflare blocked the request — sign in again from the app." }
    }
    if (!res.ok) return { ok: false, reason: `Unexpected status ${res.status}.` }

    const html = await res.text()
    if (/name=["']login["']|id=["']login["']|type=["']password["']/i.test(html) && !/logout/i.test(html)) {
      return { ok: false, reason: "Not logged in — reached the login page." }
    }
    const account = html.match(/\/account\/view-profile\/([^"'/?]+)/i)?.[1]
    return { ok: true, account: account ? decodeURIComponent(account) : undefined }
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  }
}

// ---- Saved searches ----

/**
 * Fetch the saved query definition behind a trade search URL.
 *
 * Opening /trade/search/{league}/{id} in a browser makes this same GET to
 * rehydrate the filter panel. The exact response shape is not documented, so
 * be tolerant: take `query`/`sort` when present, otherwise pass the whole
 * object back to POST minus the id. Verify against real traffic during the
 * first live run (this is flagged in the README's handoff list).
 */
export async function getSavedQuery(
  session: Session,
  league: string,
  searchId: string,
): Promise<unknown> {
  const referer = `${BASE}/trade/search/${encodeURIComponent(league)}/${searchId}`
  const data = await pacedJson<Record<string, unknown>>(
    `${BASE}/api/trade/search/${encodeURIComponent(league)}/${searchId}`,
    session,
    { method: "GET" },
    referer,
  )
  if (data && typeof data === "object" && "query" in data) {
    const { query, sort } = data as { query: unknown; sort?: unknown }
    return sort ? { query, sort } : { query }
  }
  const { id: _drop, ...rest } = data ?? {}
  return rest
}

export interface SearchRun {
  /** PoE search id the POST returned (normally equals the saved id). */
  id: string
  /** Result ids, sorted per the query's sort (price ascending for our use). */
  result: string[]
  /** Total matching listings, as reported by GGG. */
  total: number
}

/** Execute a query against a league. Body is a cached saved query or a generated one. */
export async function runSearch(session: Session, league: string, body: unknown): Promise<SearchRun> {
  const referer = `${BASE}/trade/search/${encodeURIComponent(league)}`
  const data = await pacedJson<{ id?: string; result?: string[]; total?: number }>(
    `${BASE}/api/trade/search/${encodeURIComponent(league)}`,
    session,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    referer,
  )
  return {
    id: data.id ?? "",
    result: Array.isArray(data.result) ? data.result : [],
    total: typeof data.total === "number" ? data.total : 0,
  }
}

// ---- Listing samples ----

/** What the analyzer keeps from one fetched listing. */
export interface SampledListing {
  id: string
  amount: number
  currency: "chaos" | "divine"
  instantBuyout: boolean
}

interface RawResult {
  id: string
  listing?: {
    whisper_token?: string
    hideout_token?: string
    price?: { type?: string; amount?: number; currency?: string }
  }
}

/**
 * Fetch up to 10 result ids and reduce them to (price, currency, instant?).
 * Unpriced listings and currencies other than chaos/divine are dropped here so
 * the store only ever sees what the dashboard is defined over.
 */
export async function sampleListings(
  session: Session,
  ids: string[],
  searchId: string,
  league: string,
): Promise<SampledListing[]> {
  if (ids.length === 0) return []
  const batch = ids.slice(0, 10)
  const referer = `${BASE}/trade/search/${encodeURIComponent(league)}/${searchId}`
  const url = `${BASE}/api/trade/fetch/${batch.join(",")}?query=${searchId}&realm=pc`

  const data = await pacedJson<{ result?: (RawResult | null)[] }>(url, session, { method: "GET" }, referer)
  const results = (data.result ?? []).filter(Boolean) as RawResult[]

  const out: SampledListing[] = []
  for (const raw of results) {
    const listing = raw.listing ?? {}
    const price = listing.price
    if (!price || typeof price.amount !== "number" || price.amount <= 0) continue
    if (price.currency !== "chaos" && price.currency !== "divine") continue
    const token = listing.whisper_token ?? listing.hideout_token ?? null
    // Instant buyout is identified by the token type: the Travel-to-Hideout
    // token carries tok:"hideout" (confirmed in SpeedyCadiro against the trade
    // site's own whisper request).
    const instantBuyout = decodeWhisperToken(token)?.tok === "hideout"
    out.push({ id: raw.id, amount: price.amount, currency: price.currency, instantBuyout })
  }
  return out
}

export function tradeSearchUrl(league: string, searchId: string): string {
  return `${BASE}/trade/search/${encodeURIComponent(league)}/${searchId}`
}

export { BASE as POE_BASE }
