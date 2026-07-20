"use client"

// The Logs tab: a flat, newest-first record of what the app actually did —
// every poll, every discovery verification, every draft/tracked/session
// action — each with a mandatory 24h timestamp. Read-only, no filtering
// machinery beyond a simple kind filter; this is for "what just happened",
// not analytics.

import { useState } from "react"
import { clockTime, type LogEntryModel } from "./api"

const LEVEL_COLOR: Record<LogEntryModel["level"], string> = {
  info: "text-neutral-300",
  warn: "text-amber-400",
  error: "text-red-400",
}

export function LogsPanel({ logs }: { logs: LogEntryModel[] }) {
  const [kind, setKind] = useState<string>("all")
  const kinds = ["all", ...Array.from(new Set(logs.map((l) => l.kind))).sort()]
  const filtered = kind === "all" ? logs : logs.filter((l) => l.kind === kind)

  return (
    <div className="rounded-lg border border-neutral-700 bg-[#1a1a1a]">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
        <div>
          <span className="font-medium text-neutral-100">Logs</span>
          <span className="ml-2 text-xs text-neutral-400">
            {filtered.length} of {logs.length} events · newest first
          </span>
        </div>
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

      {filtered.length === 0 ? (
        <div className="px-4 py-6 text-sm text-neutral-400">
          Nothing logged yet — polls, discovery verifications, and every add/remove/promote action will
          appear here as they happen.
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
    </div>
  )
}
