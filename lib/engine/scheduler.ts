// The heartbeat. One loop, one job at a time, never a burst.
//
// Every 20 seconds the loop wakes, asks "is exactly one thing due?", and does
// it. Poll due-times are smeared: each tracked search hashes to its own offset
// inside the interval, so 50 searches on a 20-minute interval fire as a steady
// trickle, not a thundering herd at :00. On top of that every actual GGG
// request still goes through the rate limiter's own spacing.
//
// The scheduler also honours the SpeedyCadiro coordination hold and pauses
// itself entirely while the session is missing or invalid.

import { getSearches, getSession, getSettings, getDivine, saveDivine } from "@/lib/poe/config"
import { POLL_INTERVAL_MAX, POLL_INTERVAL_MIN } from "@/lib/poe/types"
import { pollSearch } from "./tracker"
import { refreshUniverse, verifyOne } from "./discovery"
import { coordinationHoldMs } from "./coordination"
import { compact } from "@/lib/store/observations"
import { fetchDivineRate } from "@/lib/ninja"
import { RateLimitError, SessionError, CloudflareError } from "@/lib/poe/poe-client"
import { rateLimiter } from "@/lib/poe/rate-limit"

const TICK_MS = 20_000
const DIVINE_REFRESH_MS = 3600_000
const COMPACT_EVERY_MS = 24 * 3600_000

export interface SchedulerStatus {
  running: boolean
  /** Human message shown in the header, e.g. "holding for SpeedyCadiro". */
  state: string
  lastJob: string | null
  lastJobAt: number
  sessionValid: boolean | null
  limiter: { spacingMs: number; worstUsage: number; restrictedForSec: number }
}

class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private busy = false
  private backoffUntil = 0
  private lastDivineAt = 0
  private lastCompactAt = 0
  private lastDiscoveryAt = 0
  private status: SchedulerStatus = {
    running: false,
    state: "starting",
    lastJob: null,
    lastJobAt: 0,
    sessionValid: null,
    limiter: { spacingMs: 0, worstUsage: 0, restrictedForSec: 0 },
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.status.running = true
    this.status.state = "idle"
  }

  getStatus(): SchedulerStatus {
    return { ...this.status, limiter: rateLimiter.status }
  }

  /** Note that a session change should reset error backoff. */
  sessionChanged(): void {
    this.backoffUntil = 0
    this.status.sessionValid = null
  }

  private async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      await this.runOne()
    } catch (err) {
      // runOne handles its own errors; this is the belt for the suspenders.
      console.error("[scheduler]", (err as Error).message)
    } finally {
      this.busy = false
    }
  }

  private async runOne(): Promise<void> {
    const now = Date.now()
    if (now < this.backoffUntil) {
      this.status.state = `backing off ${Math.ceil((this.backoffUntil - now) / 1000)}s`
      return
    }

    const settings = await getSettings()

    // Non-GGG housekeeping first: cheap and unaffected by holds.
    if (now - this.lastDivineAt > DIVINE_REFRESH_MS) {
      this.lastDivineAt = now
      await this.refreshDivine(settings.league, settings.useNinjaRate, settings.manualDivineRate)
    }
    if (now - this.lastCompactAt > COMPACT_EVERY_MS) {
      this.lastCompactAt = now
      const searches = await getSearches()
      for (const s of searches) {
        await compact(s.id, settings.retentionDays * 24 * 3600_000)
      }
      this.note("compaction")
    }
    await refreshUniverse()

    // Anything below talks to GGG.
    const session = await getSession()
    if (!session) {
      this.status.state = "no session — sign in"
      this.status.sessionValid = false
      return
    }
    this.status.sessionValid = true

    const hold = await coordinationHoldMs(settings.coordinationHoldSec)
    if (hold > 0) {
      this.status.state = `holding for SpeedyCadiro (${Math.ceil(hold / 1000)}s)`
      return
    }

    // One due tracked search per tick, most-overdue first, smeared by a
    // per-search phase offset so due-times spread across the interval.
    const intervalMs =
      Math.min(POLL_INTERVAL_MAX, Math.max(POLL_INTERVAL_MIN, settings.pollIntervalMin)) * 60_000
    const searches = (await getSearches()).filter((s) => s.active)
    const due = searches
      .map((s) => ({ s, dueAt: (s.lastPolledAt || 0) + intervalMs + this.phase(s.id, intervalMs) }))
      .filter((x) => x.dueAt <= now || x.s.lastPolledAt === 0)
      .sort((a, b) => a.dueAt - b.dueAt)

    if (due.length > 0) {
      const target = due[0].s
      this.status.state = `polling "${target.title}"`
      try {
        await pollSearch(session, target)
        this.note(`polled ${target.title}`)
      } catch (err) {
        this.handleError(err)
      }
      return
    }

    // No poll due — spend the tick on discovery, within its hourly allowance.
    const perHour = Math.max(0, settings.discoveryPerHour)
    if (perHour > 0 && now - this.lastDiscoveryAt > 3600_000 / perHour) {
      this.status.state = "verifying a discovery candidate"
      this.lastDiscoveryAt = now
      try {
        const name = await verifyOne(session)
        if (name) this.note(`verified ${name}`)
        else this.status.state = "idle"
      } catch (err) {
        this.handleError(err)
      }
      return
    }

    this.status.state = "idle"
  }

  /** Deterministic per-search offset in [0, interval/2), so polls interleave. */
  private phase(id: string, intervalMs: number): number {
    let h = 0
    for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0
    return (h % 1000) * (intervalMs / 2000)
  }

  private async refreshDivine(league: string, useNinja: boolean, manual: number): Promise<void> {
    if (!useNinja) {
      await saveDivine({ rate: manual, source: "manual", updatedAt: Date.now() })
      return
    }
    const rate = await fetchDivineRate(league)
    if (rate) {
      await saveDivine({ rate, source: "ninja", updatedAt: Date.now() })
    } else {
      const current = await getDivine()
      if (!current.updatedAt) {
        await saveDivine({ rate: manual, source: "manual", updatedAt: Date.now() })
      }
    }
  }

  private note(job: string): void {
    this.status.lastJob = job
    this.status.lastJobAt = Date.now()
    this.status.state = "idle"
  }

  private handleError(err: unknown): void {
    if (err instanceof RateLimitError) {
      // A 429 means we misbehaved. Sit out well past what was asked.
      this.backoffUntil = Date.now() + Math.max(err.retryAfterMs * 2, 120_000)
      this.status.state = "rate limited — backing off"
      return
    }
    if (err instanceof SessionError || err instanceof CloudflareError) {
      this.status.sessionValid = false
      this.status.state = (err as Error).message
      // Don't hammer a dead session; wait for the user or a re-login.
      this.backoffUntil = Date.now() + 300_000
      return
    }
    this.status.state = `error: ${(err as Error).message}`.slice(0, 160)
    this.backoffUntil = Date.now() + 60_000
  }
}

// One scheduler per server process, surviving Next's dev-mode module reloads.
const globalRef = globalThis as unknown as { __sixEyeScheduler?: Scheduler }
export const scheduler: Scheduler = globalRef.__sixEyeScheduler ?? new Scheduler()
if (!globalRef.__sixEyeScheduler) {
  globalRef.__sixEyeScheduler = scheduler
  scheduler.start()
}
