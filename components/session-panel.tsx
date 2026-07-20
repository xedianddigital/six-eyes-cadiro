"use client"

// Session state and sign-in. Ported from SpeedyCadiro's session-panel after
// this app's own guessed redesign (header shows nothing when signed in) made
// things worse, not better — SpeedyCadiro's real, working pattern is simpler:
// exactly one action button visible at a time, and Sign out is ALWAYS shown
// when signed in (never hidden). That app has no header button anywhere near
// it to collide with (Settings/Options is File-menu-only there too), so
// there's nothing for a misclick to land on in the first place.
//
// SixEyesCadiro-specific addition on top of that pattern: a dev-mode manual
// cookie paste, since there's no Electron bridge outside the packaged app and
// this app is regularly exercised from a plain `pnpm dev` server.

import { useEffect, useState } from "react"
import { getJson, sendJson } from "./api"

interface SessionInfo {
  configured: boolean
  valid?: boolean
  reason?: string
  account?: string
}

type Notice = { kind: "ok" | "warn" | "error"; text: string }

export function SessionPanel({ onChanged }: { onChanged: () => void }) {
  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [busy, setBusy] = useState(false)
  // Set after mount, not during render: window.poeDesktop only exists in the
  // desktop shell, and reading it while rendering would mismatch hydration.
  const [isDesktop, setIsDesktop] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [poesessid, setPoesessid] = useState("")
  const [cfClearance, setCfClearance] = useState("")
  const [userAgent, setUserAgent] = useState("")
  const [notice, setNotice] = useState<Notice | null>(null)

  const refresh = async () => {
    try {
      setInfo(await getJson<SessionInfo>("/api/session"))
    } catch {
      setInfo(null)
    }
  }

  useEffect(() => {
    setIsDesktop(Boolean(window.poeDesktop?.isDesktop))
    void refresh()
  }, [])

  // Notices are transient by nature — without this they sit there forever
  // and read as the UI being stuck, especially once whatever they describe
  // (a login, a sign-out) has long finished.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])

  const signIn = async () => {
    if (!window.poeDesktop) return
    setBusy(true)
    setNotice({ kind: "warn", text: "Log in to pathofexile.com in the window that opened…" })
    try {
      const result = await window.poeDesktop.login()
      setNotice(
        result.valid
          ? { kind: "ok", text: "Signed in." }
          : { kind: "error", text: result.reason ?? "Sign-in didn't complete." },
      )
      await refresh()
      onChanged()
    } catch (err) {
      setNotice({ kind: "error", text: `Sign-in failed: ${(err as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  const saveManual = async () => {
    setBusy(true)
    try {
      const result = await sendJson<{ ok: boolean; valid: boolean; reason?: string }>("/api/session", "POST", {
        poesessid,
        cfClearance,
        userAgent,
      })
      setNotice(
        result.valid ? { kind: "ok", text: "Signed in." } : { kind: "error", text: result.reason ?? "Stored, but validation failed." },
      )
      setManualOpen(false)
      await refresh()
      onChanged()
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    setBusy(true)
    try {
      await sendJson("/api/session", "DELETE")
      setNotice({ kind: "warn", text: "Signed out." })
      await refresh()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const signedIn = Boolean(info?.configured && info?.valid)
  const expired = Boolean(info?.configured && info?.valid === false)

  return (
    <div className="relative flex items-center gap-2">
      {expired ? (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">expired</span>
      ) : null}

      {!signedIn && isDesktop ? (
        <button
          onClick={() => void signIn()}
          disabled={busy || info === null}
          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy ? "Working…" : "Sign in"}
        </button>
      ) : null}

      {!signedIn && !isDesktop ? (
        <button
          onClick={() => setManualOpen((v) => !v)}
          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          paste session
        </button>
      ) : null}

      {signedIn ? (
        <button
          onClick={() => void signOut()}
          disabled={busy}
          title={info?.account ? `Signed in as ${info.account}` : undefined}
          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy ? "Working…" : "Sign out"}
        </button>
      ) : null}

      {notice ? (
        <p
          className={`absolute right-0 top-full z-10 mt-1.5 w-64 rounded-md border border-neutral-700 bg-[#1a1a1a] px-3 py-2 text-xs shadow-lg ${
            notice.kind === "ok" ? "text-green-400" : notice.kind === "warn" ? "text-amber-400" : "text-red-400"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {manualOpen ? (
        <div className="absolute right-0 top-full z-10 mt-1.5 w-96 rounded-lg border border-neutral-700 bg-[#1a1a1a] p-4 shadow-xl">
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
            onClick={() => void saveManual()}
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
