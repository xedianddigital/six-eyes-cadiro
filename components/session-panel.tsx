"use client"

// Session state and sign-in. Inside the desktop shell the login runs through
// the Electron bridge exactly as in SpeedyCadiro; in plain `pnpm dev` there is
// no bridge, so a manual cookie paste is offered instead.

import { useEffect, useState } from "react"
import { getJson, sendJson } from "./api"

interface SessionInfo {
  configured: boolean
  valid?: boolean
  reason?: string
  account?: string
}

declare global {
  interface Window {
    poeDesktop?: {
      isDesktop: boolean
      login: () => Promise<{ ok: boolean; valid: boolean; reason?: string }>
      version: () => Promise<string>
    }
  }
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

  if (info?.configured && info.valid) {
    return (
      <span className="text-xs text-neutral-500">
        session ok{info.account ? ` · ${info.account}` : ""}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-amber-500">
        {info?.configured ? info.reason ?? "session invalid" : "not signed in"}
      </span>
      {typeof window !== "undefined" && window.poeDesktop ? (
        <button
          onClick={loginDesktop}
          disabled={busy}
          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-50"
        >
          {busy ? "signing in…" : "Sign in to pathofexile.com"}
        </button>
      ) : (
        <button
          onClick={() => setManualOpen((v) => !v)}
          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
        >
          paste session
        </button>
      )}
      {message ? <span className="text-xs text-neutral-500">{message}</span> : null}
      {manualOpen ? (
        <div className="absolute right-4 top-14 z-10 w-96 rounded-lg border border-neutral-800 bg-neutral-950 p-4 shadow-xl">
          <div className="mb-2 text-xs text-neutral-400">
            Dev-mode only: paste cookies from a logged-in browser tab on pathofexile.com.
          </div>
          <input
            className="mb-2 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs"
            placeholder="POESESSID"
            value={poesessid}
            onChange={(e) => setPoesessid(e.target.value)}
          />
          <input
            className="mb-2 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs"
            placeholder="cf_clearance (optional)"
            value={cfClearance}
            onChange={(e) => setCfClearance(e.target.value)}
          />
          <input
            className="mb-2 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs"
            placeholder="Browser User-Agent"
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
          />
          <button
            onClick={saveManual}
            disabled={busy || !poesessid}
            className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      ) : null}
    </div>
  )
}
