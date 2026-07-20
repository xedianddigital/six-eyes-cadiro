"use client"

// The dashboard. Local server is the only thing this page talks to; it
// re-reads once a minute, which is generous for data that moves every 15–20
// minutes, and immediately after any user action. Tracked is display-only —
// everything gets added through Import, promoted in on purpose, so nothing
// here ever silently starts polling GGG.

import { useCallback, useEffect, useState } from "react"
import {
  ago,
  getJson,
  sendJson,
  type CandidateModel,
  type DashboardModel,
  type DraftModel,
} from "@/components/api"
import { TrackedCard } from "@/components/tracked-card"
import { DiscoveryPanel } from "@/components/discovery-panel"
import { ImportPanel } from "@/components/import-panel"
import { SessionPanel } from "@/components/session-panel"
import { LogsPanel } from "@/components/logs-panel"
import { useConfirm } from "@/components/confirm-dialog"

interface DiscoveryModel {
  refreshedAt: number
  league: string
  candidates: CandidateModel[]
}

type Tab = "tracked" | "import" | "discovery" | "logs"

export default function Page() {
  const [tab, setTab] = useState<Tab>("tracked")
  const [dash, setDash] = useState<DashboardModel | null>(null)
  const [discovery, setDiscovery] = useState<DiscoveryModel | null>(null)
  const [drafts, setDrafts] = useState<DraftModel[]>([])
  const { confirm, alert, dialog } = useConfirm()

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
    if (!(await confirm("Remove this search and its collected history?", { danger: true }))) return
    await sendJson(`/api/tracked/${id}`, "DELETE")
    await refresh()
  }

  const discoveryAction = async (key: string, action: "dismiss") => {
    try {
      await sendJson("/api/discovery", "POST", { key, action })
      await refresh()
    } catch (err) {
      await alert((err as Error).message)
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

  const statusTooltip = [
    sched ? sched.state : "connecting…",
    sched?.lastJob ? `last: ${sched.lastJob} ${ago(sched.lastJobAt)}` : null,
    dash ? `divine ${Math.round(dash.divine.rate)}c (${dash.divine.source})` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <main className="mx-auto max-w-[1920px] px-4 py-3">
      {/* Title, tabs and account controls share one row on purpose — every
          row here is a row a 45-card grid doesn't get. Scheduler/divine
          status moves into the title's tooltip instead of its own line. */}
      <header className="mb-3 flex items-center gap-4 border-b border-neutral-900 pb-3">
        <h1 title={statusTooltip} className="shrink-0 text-base font-semibold text-neutral-100">
          Six Eyes Cadiro
        </h1>
        <nav className="flex gap-1">
          {tabButton("tracked", "Dashboard", dash?.cards.length)}
          {tabButton("import", "Import", drafts.length)}
          {tabButton("discovery", "Discovery", discovery?.candidates.length)}
          {tabButton("logs", "Logs")}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <SessionPanel onChanged={() => void refresh()} />
        </div>
      </header>

      {tab === "tracked" ? (
        dash && dash.cards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-500">
            Nothing tracked yet — add or promote something from the Import tab. Each search is polled
            every ~20 minutes; cards fill in as history accumulates.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1920px]:grid-cols-6">
            {dash?.cards.map((card) => (
              <TrackedCard
                key={card.id}
                card={card}
                divineRate={dash.divine.rate}
                onPause={pause}
                onRemove={remove}
                onRename={rename}
              />
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

      {tab === "logs" ? <LogsPanel windowHours={dash?.windowHours ?? 6} /> : null}

      <footer className="mt-4 text-center text-xs text-neutral-600">
        Reads listings slowly through GGG&apos;s published rate limits. No automation of gameplay, no
        trading on your behalf.
      </footer>

      {dialog}
    </main>
  )
}
