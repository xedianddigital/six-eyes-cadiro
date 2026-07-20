"use client"

// The discovery review queue. Candidates are ranked by observed spread — the
// gap between the cheap end and the median of live instant-buyout asks — and
// every action is manual: open it or dismiss it. The rotation only proposes;
// the user decides, because filtered parameters matter.
//
// No "track" action on purpose: every generated search this app has tried
// (see CLAUDE.md) opens on the real trade site with "Sale type: In-person
// only" selected, and guessing at GGG's filter schema a third time isn't the
// move. "open" is a real starting point, not a finished search — the user
// fixes the sale-type filter (and adds any mod/price ranges they want) on
// the trade site itself, then pastes the corrected URL into Import.

import { ago, chaosText, type CandidateModel } from "./api"

export function DiscoveryPanel({
  candidates,
  refreshedAt,
  league,
  onAction,
}: {
  candidates: CandidateModel[]
  refreshedAt: number
  league: string
  onAction: (key: string, action: "dismiss") => void
}) {
  return (
    <div className="rounded-lg border border-neutral-700 bg-[#1a1a1a]">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div>
          <span className="font-medium text-neutral-100">Discovery</span>
          <span className="ml-2 text-xs text-neutral-400">
            {league} uniques via poe.ninja · universe refreshed {ago(refreshedAt)}
          </span>
        </div>
        <span className="text-xs text-neutral-400">{candidates.length} candidates</span>
      </div>

      <div className="border-b border-neutral-800 px-4 py-2 text-xs text-neutral-400">
        "open" is a starting point, not a finished search — GGG's generated filter often needs fixing
        (Sale type → Buyout, plus whatever mod/price ranges you want) on the trade site. Paste the
        corrected URL into Import to track it.
      </div>

      {candidates.length === 0 ? (
        <div className="px-4 py-6 text-sm text-neutral-400">
          No candidates yet — the universe refreshes daily and verifications trickle in a few per hour.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-400">
              <th className="px-4 py-2 font-normal">item</th>
              <th className="px-2 py-2 text-right font-normal">ninja</th>
              <th className="px-2 py-2 text-right font-normal">live p10</th>
              <th className="px-2 py-2 text-right font-normal">live p50</th>
              <th className="px-2 py-2 text-right font-normal">spread</th>
              <th className="px-2 py-2 text-right font-normal">listings</th>
              <th className="px-4 py-2 text-right font-normal">actions</th>
            </tr>
          </thead>
          <tbody>
            {candidates.slice(0, 30).map((c) => {
              const v = c.verified
              const hot = v?.spreadPct != null && v.spreadPct >= 10
              return (
                <tr key={c.key} className="border-t border-neutral-800 hover:bg-neutral-800/60">
                  <td className="max-w-[220px] truncate px-4 py-2 text-neutral-200">{c.name}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-neutral-300">{c.ninjaChaos}c</td>
                  <td className="px-2 py-2 text-right tabular-nums text-neutral-300">
                    {v ? `${chaosText(v.p10)}c` : "…"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-neutral-300">
                    {v ? `${chaosText(v.p50)}c` : "…"}
                  </td>
                  <td
                    className={`px-2 py-2 text-right tabular-nums ${hot ? "font-medium text-green-400" : "text-neutral-300"}`}
                  >
                    {v?.spreadPct != null ? `${v.spreadPct}%` : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-neutral-400">
                    {v ? v.total : c.ninjaCount}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {v?.url ? (
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700"
                        >
                          open
                        </a>
                      ) : null}
                      <button
                        onClick={() => onAction(c.key, "dismiss")}
                        className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-700"
                      >
                        dismiss
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
