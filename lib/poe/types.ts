// Shared types for SixEyesCadiro — the calm market analyzer.
//
// Everything here is about *reading* the market slowly and honestly. Nothing in
// this app whispers, travels, or touches gameplay.

export interface Session {
  poesessid: string
  poetoken: string
  cfClearance: string
  userAgent: string
  updatedAt: number
}

/** One trade search URL the user tracks. */
export interface TrackedSearch {
  /** Internal id used by this app (not the PoE search id). */
  id: string
  /** Full URL the user pasted (or that discovery generated). */
  url: string
  /** League segment parsed from the URL, e.g. "Mirage". */
  league: string
  /** PoE trade search id parsed from the URL. */
  searchId: string
  /** Human label. Defaults to league + short id until the first poll names it. */
  title: string
  /** Free-text comment, e.g. "specific roll" — shown in the title tooltip. */
  notes: string
  /** Paused searches stay on the dashboard but are never polled. */
  active: boolean
  /**
   * The saved query JSON fetched once from GGG and replayed on every poll.
   * Cached so a poll costs one POST, not GET+POST. Refreshed if a POST 400s.
   */
  cachedQuery: unknown | null
  /** Unix ms of the last completed poll (successful or not). */
  lastPolledAt: number
  /** Human-readable error from the last poll, if it failed. */
  lastError: string | null
  createdAt: number
}

/** One priced listing we observed, deduplicated by PoE listing id. */
export interface Observation {
  /** PoE listing id. */
  id: string
  /** Price normalised to chaos (divine listings converted at the stored rate). */
  chaos: number
  /** Original price as listed. */
  amount: number
  currency: "chaos" | "divine"
  /** Unix ms this listing was first seen by us. */
  firstSeen: number
  /** Unix ms this listing was last confirmed still listed. */
  lastSeen: number
}

/** Per-poll aggregate — one line per poll, the raw material of the trend graph. */
export interface Snapshot {
  /** Unix ms of the poll. */
  t: number
  /** Total result count GGG reported for the search (all listings, capped at ~10k). */
  total: number
  /** How many instant-buyout chaos/divine listings this poll actually sampled. */
  sampled: number
  /** Percentiles over the *window* at poll time, in chaos. Null when too few points. */
  p25: number | null
  p50: number | null
  p75: number | null
  /** Distinct listings observed within the window at poll time. */
  windowCount: number
}

export type Trend = "rising" | "falling" | "stable" | "unknown"

/** What a dashboard card shows. Computed on read, never stored. */
export interface SearchStats {
  windowHours: number
  /** Distinct instant-buyout listings observed in the window. */
  count: number
  /** Newly appeared listings per hour over the window. */
  newPerHour: number
  /** Median chaos-normalized ask price among the sampled cheap frontier in the window. */
  p50: number | null
  /**
   * How many of the window's listings are priced at or below 50%/75% of
   * that median — a live mispricing count, not a percentile. By definition
   * this is usually 0; a nonzero count is the actual signal.
   */
  countBelowHalfMedian: number
  countBelow75PctMedian: number
  /** GGG's total from the most recent poll (includes non-instant listings). */
  lastTotal: number | null
  /**
   * How many of the window's listings were originally priced in each
   * currency, before chaos-normalization. The card shows whichever
   * currency actually dominates this item's market as the primary
   * (large-digit) price, with the other as a converted secondary figure —
   * always defaulting to chaos on a tie (0 divine listings is the common
   * case, and chaos is this app's base unit / more legible at small
   * magnitudes anyway).
   */
  chaosListings: number
  divineListings: number
  dominantCurrency: "chaos" | "divine"
  /**
   * Actual elapsed hours the graph currently covers (oldest to newest
   * snapshot in the window), capped at windowHours. Grows from 0 up to
   * windowHours as snapshots accumulate — the trend/graph aren't at full
   * precision until this reaches windowHours, so the UI shows both numbers
   * rather than letting a short-lived search look as settled as a mature one.
   */
  spanHours: number
  trend: Trend
  /** Percent change of p50 over the window, e.g. -6.3. Null when unknown. */
  trendPct: number | null
  /** [t, p50] pairs for the sparkline, oldest first. */
  series: [number, number][]
  /**
   * Timestamps (each the later point of a pair) where the gap since the
   * previous snapshot was more than 2x the configured poll interval — a
   * paused search, a closed app, or a stalled scheduler, not a real price
   * move. The sparkline draws a vertical marker at each instead of
   * interpolating a smooth line across unknown territory.
   */
  gapMarkers: number[]
}

export interface Settings {
  /**
   * Default league for discovery and for newly generated searches. Tracked
   * searches keep the league baked into their own URL regardless.
   */
  league: string
  /** Minutes between polls of each tracked search. Calm by design. */
  pollIntervalMin: number
  /** Aggregation window for the dashboard, in hours (6/12/18/24…). */
  windowHours: number
  /** Days of raw observations to keep before compaction drops them. */
  retentionDays: number
  /** Result pages fetched per poll (10 listings each). 1–3. */
  fetchPages: number
  /** Discovery verifications per hour. 0 disables discovery polling entirely. */
  discoveryPerHour: number
  /** Manual divine:chaos rate used when poe.ninja is unreachable. */
  manualDivineRate: number
  /** Prefer poe.ninja's live divine rate over the manual one. */
  useNinjaRate: boolean
  /**
   * Hold all GGG polling for a while after SpeedyCadiro reports a travel
   * (read from its activity file). Zero disables coordination.
   */
  coordinationHoldSec: number
}

export const DEFAULT_SETTINGS: Settings = {
  league: "Mirage",
  pollIntervalMin: 20,
  windowHours: 6,
  retentionDays: 14,
  fetchPages: 1,
  discoveryPerHour: 4,
  manualDivineRate: 150,
  useNinjaRate: true,
  coordinationHoldSec: 30,
}

export const POLL_INTERVAL_MIN = 10
export const POLL_INTERVAL_MAX = 120
export const WINDOW_HOURS_CHOICES = [6, 12, 18, 24, 48] as const
export const FETCH_PAGES_MAX = 3
export const DISCOVERY_PER_HOUR_MAX = 10

/**
 * Hard cap on tracked searches. At 50 searches, a 20-minute interval and one
 * fetch page, steady state is ~5 GGG requests per minute *before* the limiter
 * smears them further — background noise, and it stays that way.
 */
export const MAX_TRACKED = 50

/** One discovery candidate awaiting the user's manual review. */
export interface DiscoveryCandidate {
  /** poe.ninja detailsId — stable key for dedupe/dismissal. */
  key: string
  name: string
  /** poe.ninja item class, e.g. "UniqueWeapon". */
  ninjaType: string
  /** poe.ninja's computed value in chaos. */
  ninjaChaos: number
  /** poe.ninja's listing count. */
  ninjaCount: number
  /** Verified against live trade (filled by the rotation, null until then). */
  verified: null | {
    t: number
    total: number
    sampled: number
    p10: number | null
    p50: number | null
    /** (p50 - p10) / p50 — how deep below "market" the cheap end sits. */
    spreadPct: number | null
    /** Generated search URL for the Open button. */
    url: string | null
  }
  /** Candidates the user dismissed stay hidden until the next league. */
  dismissed: boolean
}

/**
 * One search imported from a pasted markdown draft list, awaiting a manual
 * "promote" before it counts against MAX_TRACKED. See lib/import.ts for the
 * format and docs/starter-picks.md for the user-facing explanation.
 */
export interface DraftSearch {
  /** Internal id, stable across re-imports of the same URL. */
  key: string
  /** The heading the entry was grouped under, e.g. "Watcher's Eye". */
  itemName: string
  /** Free-text label distinguishing variants of the same item. Empty for a manually-added single entry. */
  variant: string
  /** Free-text comment, carried onto the tracked search when promoted. */
  notes: string
  url: string
  league: string
  searchId: string
  addedAt: number
}

export interface AppConfig {
  session: Session | null
  searches: TrackedSearch[]
  settings: Settings
  discovery: {
    /** Unix ms of the last poe.ninja universe refresh. */
    refreshedAt: number
    candidates: DiscoveryCandidate[]
    /**
     * Version of the generated query shape (discovery.ts's queryFor) that
     * every candidate's `verified` data was last computed against. Bumped
     * whenever that shape changes in a way that invalidates previously-
     * verified search ids/urls (e.g. a wrong trade filter baked into every
     * one of them) — undefined/mismatched forces a one-time full
     * re-verification in refreshUniverse rather than leaving stale,
     * wrongly-filtered URLs sitting around until each candidate's normal
     * 12h re-verify happens to come up.
     */
    queryVersion?: number
  }
  divine: {
    /** chaos per divine currently in use. */
    rate: number
    source: "ninja" | "manual"
    updatedAt: number
  }
  drafts: DraftSearch[]
}
