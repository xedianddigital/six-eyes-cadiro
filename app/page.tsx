"use client"

// The dashboard. Local server is the only thing this page talks to; it
// re-reads once a minute, which is generous for data that moves every 15–20
// minutes, and immediately after any user action.

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
import { SettingsPanel } from "@/components/settings-panel"

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
  const [url, setUrl] = useState("")
  const [name, setName] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

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

  const addSearch = async () => {
    setAddError(null)
    try {
      await sendJson("/api/tracked", "POST", { url, title: name.trim() || undefined })
      setUrl("")
      setName("")
      await refresh()
    } catch (err) {
      setAddError((err as Error).message)
    }
  }

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
    <main className="mx-auto max-w-[1600px] px-4 py-6">
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
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-900"
          >
            settings
          </button>
        </div>
      </header>

      {showSettings ? (
        <div className="mb-6 max-w-xl">
          <SettingsPanel onChanged={() => void refresh()} />
        </div>
      ) : null}

      <nav className="mb-6 flex gap-1 border-b border-neutral-900 pb-3">
        {tabButton("tracked", "Tracked", dash?.cards.length)}
        {tabButton("import", "Import", drafts.length)}
        {tabButton("discovery", "Discovery", discovery?.candidates.length)}
      </nav>

      {tab === "tracked" ? (
        <>
          <div className="mb-6 flex gap-2">
            <input
              className="w-48 rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm placeholder:text-neutral-600"
              placeholder="name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addSearch()
              }}
            />
            <input
              className="flex-1 rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm placeholder:text-neutral-600"
              placeholder="https://www.pathofexile.com/trade/search/Mirage/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addSearch()
              }}
            />
            <button
              onClick={() => void addSearch()}
              disabled={!url.trim()}
              className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-40"
            >
              Track
            </button>
          </div>
          {addError ? <div className="-mt-4 mb-4 text-xs text-red-400">{addError}</div> : null}
          {dash && dash.cards.length >= dash.maxTracked ? (
            <div className="-mt-4 mb-4 text-xs text-amber-500">
              At the {dash.maxTracked}-search cap — remove something before adding more.
            </div>
          ) : null}

          {dash && dash.cards.length === 0 ? (
            <div className="mb-6 rounded-lg border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-500">
              Paste a trade search URL above, or promote something from the Import tab. Each search is
              polled every ~20 minutes; cards fill in as history accumulates.
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {dash?.cards.map((card) => (
              <TrackedCard key={card.id} card={card} onPause={pause} onRemove={remove} onRename={rename} />
            ))}
          </div>
        </>
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
