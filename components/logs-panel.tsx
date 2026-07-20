"use client"

// The Logs tab: a flat, newest-first record of what the app actually did —
// every poll, every discovery verification, every draft/tracked/session
// action — each with a mandatory 24h timestamp.
//
// Self-fetches rather than riding the page's shared 60s refresh: unlike the
// other tabs this one paginates, and a shared refresh would either reset the
// user's scroll position mid-page or need its own cursor-aware merge logic.
// Defaults to the dashboard's configured window (matching Settings'
// windowHours) so it doesn't render the app's entire history as one
// ever-growing page — "All logs" switches to unbounded, cursor-paginated
// history instead, and turns off the periodic auto-refresh (nothing should
// silently shift what the user is paging through).

import { useCallback, useEffect, useState } from "react"
import { clockTime, getJson, type LogEntryModel } from "./api"

const LEVEL_COLOR: Record<LogEntryModel["level"], string> = {
  info: "text-neutral-300",
  warn: "text-amber-400",
  error: "text-red-400",
}

interface LogsResponse {
  entries: LogEntryModel[]
  hasMore: boolean
  windowHours: number
}

type Scope = "window" | "all"

export function LogsPanel({ windowHours }: { windowHours: number }) {
  const [scope, setScope] = useState<Scope>("window")
  const [kind, setKind] = useState<string>("all")
  const [entries, setEntries] = useState<LogEntryModel[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchPage = useCallback(async (reset: boolean, before?: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (scope === "all") params.set("hours", "0")
      if (before != null) params.set("before", String(before))
      const res = await getJson<LogsResponse>(`/api/logs?${params.toString()}`)
      setEntries((prev) => (reset ? res.entries : [...prev, ...res.entries]))
      setHasMore(res.hasMore)
    } catch {
      // Server briefly unavailable; leave what's already loaded.
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => {
    void fetchPage(true)
  }, [fetchPage])

  // Only auto-refresh the windowed view — "all" is a paginated history the
  // user is actively scrolling through, and a refresh would reset that.
  useEffect(() => {
    if (scope !== "window") return
    const timer = setInterval(() => void fetchPage(true), 60_000)
    return () => clearInterval(timer)
  }, [scope, fetchPage])

  const loadOlder = () => {
    const oldest = entries[entries.length - 1]
    if (oldest) void fetchPage(false, oldest.t)
  }

  const kinds = ["all", ...Array.from(new Set(entries.map((l) => l.kind))).sort()]
  const filtered = kind === "all" ? entries : entries.filter((l) => l.kind === kind)

  return (
    <div className="rounded-lg border border-neutral-700 bg-[#1a1a1a]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
        <div>
          <span className="font-medium text-neutral-100">Logs</span>
          <span className="ml-2 text-xs text-neutral-400">
            {filtered.length} event{filtered.length === 1 ? "" : "s"} shown
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
          >
            <option value="window">Last {windowHours}h (settings window)</option>
            <option value="all">All logs</option>
          </select>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-6 text-sm text-neutral-400">
          {loading
            ? "Loading…"
            : scope === "window"
              ? `Nothing logged in the last ${windowHours}h — try "All logs", or just wait for the next poll.`
              : "Nothing logged yet — polls, discovery verifications, and every add/remove/promote action will appear here as they happen."}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-400">
              <th className="px-4 py-2 font-normal">time (24h)</th>
              <th className="w-24 px-2 py-2 font-normal">kind</th>
              <th className="px-2 py-2 font-normal">event</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l, i) => (
              <tr key={`${l.t}-${i}`} className="border-t border-neutral-800 hover:bg-neutral-800/60">
                <td className="whitespace-nowrap px-4 py-1.5 tabular-nums text-neutral-400">{clockTime(l.t)}</td>
                <td className="px-2 py-1.5 text-neutral-500">{l.kind}</td>
                <td className={`px-2 py-1.5 ${LEVEL_COLOR[l.level]}`}>{l.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {hasMore ? (
        <div className="border-t border-neutral-800 px-4 py-2 text-center">
          <button
            onClick={loadOlder}
            disabled={loading}
            className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
          >
            {loading ? "Loading…" : "Load older"}
          </button>
        </div>
      ) : null}
    </div>
  )
}
