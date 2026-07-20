"use client"

// Session state and sign-in. Inside the desktop shell the login runs through
// the Electron bridge exactly as in SpeedyCadiro; in plain `pnpm dev` there is
// no bridge, so a manual cookie paste is offered instead.
//
// Deliberately quiet when everything's fine: a "session ok" success message
// (or, briefly, a Log out button) sitting in the header forever added
// nothing actionable and put a real action right where the old Settings
// toggle used to live — a plausible misclick. Renders nothing when signed
// in; Log out lives only on the Settings page now. Signed out is the only
// state that needs your attention here.

import { useEffect, useState } from "react"
import { getJson, sendJson } from "./api"

interface SessionInfo {
  configured: boolean
  valid?: boolean
  reason?: string
  account?: string
}

export function SessionPanel({ onChanged }: { onChanged: () => void }) {
  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [poesessid, setPoesessid] = useState("")
  const [cfClearance, setCfClearance] = useState("")
  const [userAgent, setUserAgent] = useState("")
  const [message, setMessage] = useState<string | null>(null)

  const refresh = async () => {
    try {
      setInfo(await getJson<SessionInfo>("/api/session"))
    } catch {
      setInfo(null)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const loginDesktop = async () => {
    if (!window.poeDesktop) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await window.poeDesktop.login()
      setMessage(result.ok ? (result.valid ? "Signed in." : result.reason ?? "Stored, but validation failed.") : result.reason ?? "Login cancelled.")
      await refresh()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const saveManual = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await sendJson<{ ok: boolean; valid: boolean; reason?: string }>("/api/session", "POST", {
        poesessid,
        cfClearance,
        userAgent,
      })
      setMessage(result.valid ? "Signed in." : result.reason ?? "Stored, but validation failed.")
      setManualOpen(false)
      await refresh()
      onChanged()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Deliberately renders nothing when signed in — a header button here
  // previously sat exactly where the old Settings toggle used to be, which
  // reads as a plausible cause of an accidental log-out (clicking the
  // familiar spot expecting Settings). Log out now lives only on the
  // Settings page, a click that has to be reached deliberately.
  if (info?.configured && info.valid) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-amber-500">
        {info?.configured ? info.reason ?? "session invalid" : "not signed in"}
      </span>
      {typeof window !== "undefined" && window.poeDesktop ? (
        <button
          onClick={loginDesktop}
          disabled={busy}
          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy ? "signing in…" : "Sign in to pathofexile.com"}
        </button>
      ) : (
        <button
          onClick={() => setManualOpen((v) => !v)}
          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          paste session
        </button>
      )}
      {message ? <span className="text-xs text-neutral-500">{message}</span> : null}
      {manualOpen ? (
        <div className="absolute right-4 top-14 z-10 w-96 rounded-lg border border-neutral-800 bg-neutral-900 p-4 shadow-xl">
          <div className="mb-2 text-xs text-neutral-400">
            Dev-mode only: paste cookies from a logged-in browser tab on pathofexile.com.
          </div>
          <input
            className="mb-2 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
            placeholder="POESESSID"
            value={poesessid}
            onChange={(e) => setPoesessid(e.target.value)}
          />
          <input
            className="mb-2 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
            placeholder="cf_clearance (optional)"
            value={cfClearance}
            onChange={(e) => setCfClearance(e.target.value)}
          />
          <input
            className="mb-2 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
            placeholder="Browser User-Agent"
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
          />
          <button
            onClick={saveManual}
            disabled={busy || !poesessid}
            className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      ) : null}
    </div>
  )
}
