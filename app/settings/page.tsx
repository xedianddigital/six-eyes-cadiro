"use client"

// Settings lives on its own page (reached via File → Settings in the desktop
// shell, or this URL directly in dev) rather than a collapsible header panel
// — it's not something you toggle mid-glance at the dashboard.

import { useEffect, useState } from "react"
import Link from "next/link"
import { getJson, sendJson } from "@/components/api"
import { SettingsPanel } from "@/components/settings-panel"

interface SessionInfo {
  configured: boolean
  valid?: boolean
  reason?: string
  account?: string
  updatedAt?: number
}

export default function SettingsPage() {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => void getJson<SessionInfo>("/api/session").then(setSession)

  useEffect(() => {
    refresh()
  }, [])

  const logOut = async () => {
    if (!confirm("Log out? You'll need to sign in again before polling can resume.")) return
    setBusy(true)
    try {
      await sendJson("/api/session", "DELETE")
      refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-100">Settings</h1>
        <Link href="/" className="text-xs text-neutral-400 hover:text-neutral-200">
          ← back to dashboard
        </Link>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-700 bg-[#1a1a1a] p-4">
        <div className="mb-2 font-medium text-neutral-100">Account</div>
        {session?.configured ? (
          <div className="flex items-center justify-between">
            <div className="text-xs text-neutral-400">
              {session.valid ? (
                <>
                  Signed in{session.account ? ` as ${session.account}` : ""}
                </>
              ) : (
                <span className="text-amber-500">{session.reason ?? "Session invalid"}</span>
              )}
            </div>
            <button
              onClick={() => void logOut()}
              disabled={busy}
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
            >
              Log out
            </button>
          </div>
        ) : (
          <div className="text-xs text-neutral-500">Not signed in — use the button on the dashboard.</div>
        )}
      </div>

      <SettingsPanel onChanged={() => {}} />
    </main>
  )
}
