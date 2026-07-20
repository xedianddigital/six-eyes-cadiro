"use client"

// Settings, laid out flat rather than in a modal: there are few enough of them,
// and a market tool's knobs should be visible where their effects are.

import { useEffect, useState } from "react"
import { getJson, sendJson, type SettingsModel } from "./api"

const WINDOWS = [6, 12, 18, 24, 48]

const RATE_LIMIT_NOTE =
  "Lower values don't increase how fast requests actually go out — that's governed separately, by reading GGG's real published rate-limit headers on every response and staying under 40% of budget with a 2-second floor, unconditionally. Lower here just means searches queue up more eagerly; if you had enough of them to strain the real budget, spacing widens automatically to compensate."

export function SettingsPanel({ onChanged }: { onChanged: () => void }) {
  const [settings, setSettings] = useState<SettingsModel | null>(null)
  const [saving, setSaving] = useState(false)
  const [leagueDraft, setLeagueDraft] = useState("")

  useEffect(() => {
    void getJson<SettingsModel>("/api/settings").then((s) => {
      setSettings(s)
      setLeagueDraft(s.league)
    })
  }, [])

  if (!settings) return null

  const patch = async (p: Partial<SettingsModel>) => {
    setSaving(true)
    try {
      const res = await sendJson<{ settings: SettingsModel }>("/api/settings", "PATCH", p)
      setSettings(res.settings)
      setLeagueDraft(res.settings.league)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  const row = "flex items-center justify-between gap-3 py-1.5"
  const label = "text-xs text-neutral-400"
  const input =
    "w-24 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right text-xs tabular-nums"

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-2 font-medium text-neutral-100">Settings</div>

      <div className={row}>
        <span className={label}>League (discovery + new searches)</span>
        <span className="flex gap-1">
          <input
            className="w-32 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
            value={leagueDraft}
            onChange={(e) => setLeagueDraft(e.target.value)}
          />
          {leagueDraft !== settings.league ? (
            <button
              onClick={() => void patch({ league: leagueDraft })}
              className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
            >
              save
            </button>
          ) : null}
        </span>
      </div>

      <div className={row}>
        <span className={label}>Window</span>
        <span className="flex gap-1">
          {WINDOWS.map((h) => (
            <button
              key={h}
              onClick={() => void patch({ windowHours: h })}
              className={`rounded border px-2 py-1 text-xs tabular-nums ${
                settings.windowHours === h
                  ? "border-neutral-500 bg-neutral-800 text-neutral-100"
                  : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
              }`}
            >
              {h}h
            </button>
          ))}
        </span>
      </div>

      <div className={row}>
        <span className={label} title={RATE_LIMIT_NOTE}>
          Poll interval (min, per search) ⓘ
        </span>
        <input
          key={settings.pollIntervalMin}
          className={input}
          type="number"
          min={10}
          max={120}
          defaultValue={settings.pollIntervalMin}
          onBlur={(e) => void patch({ pollIntervalMin: Number(e.target.value) })}
        />
      </div>

      <div className={row}>
        <span className={label} title={RATE_LIMIT_NOTE}>
          Result pages per poll (×10 listings) ⓘ
        </span>
        <input
          key={settings.fetchPages}
          className={input}
          type="number"
          min={1}
          max={3}
          defaultValue={settings.fetchPages}
          onBlur={(e) => void patch({ fetchPages: Number(e.target.value) })}
        />
      </div>

      <div className={row}>
        <span className={label}>Discovery verifications / hour (0 = off)</span>
        <input
          key={settings.discoveryPerHour}
          className={input}
          type="number"
          min={0}
          max={10}
          defaultValue={settings.discoveryPerHour}
          onBlur={(e) => void patch({ discoveryPerHour: Number(e.target.value) })}
        />
      </div>

      <div className={row}>
        <span className={label}>Retention (days)</span>
        <input
          key={settings.retentionDays}
          className={input}
          type="number"
          min={3}
          max={30}
          defaultValue={settings.retentionDays}
          onBlur={(e) => void patch({ retentionDays: Number(e.target.value) })}
        />
      </div>

      <div className={row}>
        <span className={label}>Divine rate from poe.ninja</span>
        <input
          type="checkbox"
          checked={settings.useNinjaRate}
          onChange={(e) => void patch({ useNinjaRate: e.target.checked })}
        />
      </div>

      <div className={row}>
        <span className={label}>Manual divine rate (chaos)</span>
        <input
          key={settings.manualDivineRate}
          className={input}
          type="number"
          min={1}
          defaultValue={settings.manualDivineRate}
          onBlur={(e) => void patch({ manualDivineRate: Number(e.target.value) })}
        />
      </div>

      <div className={row}>
        <span className={label}>Hold after SpeedyCadiro travel (sec, 0 = off)</span>
        <input
          key={settings.coordinationHoldSec}
          className={input}
          type="number"
          min={0}
          max={120}
          defaultValue={settings.coordinationHoldSec}
          onBlur={(e) => void patch({ coordinationHoldSec: Number(e.target.value) })}
        />
      </div>

      {saving ? <div className="mt-1 text-xs text-neutral-600">saving…</div> : null}
    </div>
  )
}
