"use client"

// The dashboard. Local server is the only thing this page talks to; it
// re-reads once a minute, which is generous for data that moves every 15–20
// minutes, and immediately after any user action. Tracked is display-only —
// everything gets added through Import, promoted in on purpose, so nothing
// here ever silently starts polling GGG.

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { ago, getJson, sendJson, type CandidateModel, type DashboardModel, type DraftModel } from "@/components/api"
import { TrackedCard } from "@/components/tracked-card"
import { DiscoveryPanel } from "@/components/discovery-panel"
import { ImportPanel } from "@/components/import-panel"
import { SessionPanel } from "@/components/session-panel"

interface DiscoveryModel {
  refreshedAt: number
  league: string
  candidates: CandidateModel[]
}

type Tab = "tracked" | "import" | "discovery"

export default function Page() {
  const [tab, setTab] = useState<Tab>("tracked")
  const [dash, setDash] = useState<DashboardModel | null>(null)
  const [discovery, setDiscovery] = useState<DiscoveryModel | null>(null)
  const [drafts, setDrafts] = useState<DraftModel[]>([])

  const refresh = useCallback(async () => {
    try {
      const [d, disc, dr] = await Promise.all([
        getJson<DashboardModel>("/api/tracked"),
        getJson<DiscoveryModel>("/api/discovery"),
        getJson<{ drafts: DraftModel[] }>("/api/drafts"),
      ])
      setDash(d)
      setDiscovery(disc)
      setDrafts(dr.drafts)
    } catch {
      // Server briefly unavailable (restart); the next interval retries.
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 60_000)
    return () => clearInterval(timer)
  }, [refresh])

  const pause = async (id: string, active: boolean) => {
    await sendJson(`/api/tracked/${id}`, "PATCH", { active })
    await refresh()
  }

  const rename = async (id: string, title: string) => {
    await sendJson(`/api/tracked/${id}`, "PATCH", { title })
    await refresh()
  }

  const remove = async (id: string) => {
    if (!confirm("Remove this search and its collected history?")) return
    await sendJson(`/api/tracked/${id}`, "DELETE")
    await refresh()
  }

  const discoveryAction = async (key: string, action: "track" | "dismiss") => {
    try {
      await sendJson("/api/discovery", "POST", { key, action })
      await refresh()
    } catch (err) {
      alert((err as Error).message)
    }
  }

  const sched = dash?.scheduler

  const tabButton = (id: Tab, label: string, count?: number) => (
    <button
      onClick={() => setTab(id)}
      className={`rounded px-3 py-1.5 text-sm ${
        tab === id
          ? "bg-neutral-800 text-neutral-100"
          : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
      }`}
    >
      {label}
      {count != null ? <span className="ml-1.5 text-xs text-neutral-500">{count}</span> : null}
    </button>
  )

  return (
    <main className="mx-auto max-w-[1920px] px-4 py-6">
      <header className="relative mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-100">SixEyesCadiro</h1>
          <div className="text-xs text-neutral-500">
            {sched ? sched.state : "connecting…"}
            {sched?.lastJob ? ` · last: ${sched.lastJob} ${ago(sched.lastJobAt)}` : ""}
            {dash ? ` · divine ${Math.round(dash.divine.rate)}c (${dash.divine.source})` : ""}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SessionPanel onChanged={() => void refresh()} />
          <Link
            href="/settings"
            title="Settings"
            className="rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
          >
            ⚙
          </Link>
        </div>
      </header>

      <nav className="mb-6 flex gap-1 border-b border-neutral-900 pb-3">
        {tabButton("tracked", "Tracked", dash?.cards.length)}
        {tabButton("import", "Import", drafts.length)}
        {tabButton("discovery", "Discovery", discovery?.candidates.length)}
      </nav>

      {tab === "tracked" ? (
        dash && dash.cards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-500">
            Nothing tracked yet — add or promote something from the Import tab. Each search is polled
            every ~20 minutes; cards fill in as history accumulates.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1920px]:grid-cols-6">
            {dash?.cards.map((card) => (
              <TrackedCard key={card.id} card={card} onPause={pause} onRemove={remove} onRename={rename} />
            ))}
          </div>
        )
      ) : null}

      {tab === "import" ? (
        <ImportPanel
          drafts={drafts}
          trackedCount={dash?.cards.length ?? 0}
          maxTracked={dash?.maxTracked ?? 50}
          onChanged={() => void refresh()}
        />
      ) : null}

      {tab === "discovery" && discovery ? (
        <DiscoveryPanel
          candidates={discovery.candidates}
          refreshedAt={discovery.refreshedAt}
          league={discovery.league}
          onAction={discoveryAction}
        />
      ) : null}

      <footer className="mt-8 text-center text-xs text-neutral-700">
        Reads listings slowly through GGG&apos;s published rate limits. No automation of gameplay, no
        trading on your behalf.
      </footer>
    </main>
  )
}
