"use client"

// The Import tab: upload a markdown draft list (see docs/starter-picks.md
// for the format), review what got parsed, promote one at a time onto the
// Tracked tab. Nothing here touches GGG — this is pure local bookkeeping.

import { useRef, useState } from "react"
import { ago, sendJson, type DraftModel } from "./api"

export function ImportPanel({
  drafts,
  trackedCount,
  maxTracked,
  onChanged,
}: {
  drafts: DraftModel[]
  trackedCount: number
  maxTracked: number
  onChanged: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const atCap = trackedCount >= maxTracked

  const upload = async (file: File) => {
    setMessage(null)
    try {
      const text = await file.text()
      const res = await sendJson<{ ok: boolean; added: number }>("/api/drafts", "POST", { markdown: text })
      setMessage(res.added > 0 ? `Added ${res.added} new draft${res.added === 1 ? "" : "s"}.` : "Nothing new in that file.")
      onChanged()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  const promote = async (key: string) => {
    setBusyKey(key)
    setMessage(null)
    try {
      await sendJson(`/api/drafts/${key}`, "POST")
      onChanged()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusyKey(null)
    }
  }

  const discard = async (key: string) => {
    setBusyKey(key)
    try {
      await sendJson(`/api/drafts/${key}`, "DELETE")
      onChanged()
    } finally {
      setBusyKey(null)
    }
  }

  const groups = new Map<string, DraftModel[]>()
  for (const d of drafts) {
    const list = groups.get(d.itemName) ?? []
    list.push(d)
    groups.set(d.itemName, list)
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
        <div>
          <span className="font-medium text-neutral-100">Import</span>
          <span className="ml-2 text-xs text-neutral-500">
            {drafts.length} draft{drafts.length === 1 ? "" : "s"} waiting · upload a .md list to add more
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".md,.txt,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
          >
            Upload .md
          </button>
        </div>
      </div>

      {message ? <div className="border-b border-neutral-900 px-4 py-2 text-xs text-neutral-400">{message}</div> : null}

      {atCap ? (
        <div className="border-b border-neutral-900 px-4 py-2 text-xs text-amber-500">
          At the {maxTracked}-search cap — remove something from Tracked before promoting more.
        </div>
      ) : null}

      {drafts.length === 0 ? (
        <div className="px-4 py-6 text-sm text-neutral-500">
          No drafts yet. See docs/starter-picks.md for the file format, or upload one above.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="px-4 py-2 font-normal">item</th>
              <th className="px-2 py-2 font-normal">variant</th>
              <th className="px-2 py-2 font-normal">added</th>
              <th className="px-4 py-2 text-right font-normal">actions</th>
            </tr>
          </thead>
          <tbody>
            {[...groups.entries()].map(([itemName, rows]) =>
              rows.map((d, i) => (
                <tr key={d.key} className="border-t border-neutral-900">
                  <td className="max-w-[220px] truncate px-4 py-2 text-neutral-200">
                    {i === 0 ? itemName : <span className="text-neutral-700">···</span>}
                  </td>
                  <td className="px-2 py-2 text-neutral-400">{d.variant}</td>
                  <td className="px-2 py-2 text-xs text-neutral-600">{ago(d.addedAt)}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border border-neutral-800 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-900"
                      >
                        open
                      </a>
                      <button
                        onClick={() => void promote(d.key)}
                        disabled={atCap || busyKey === d.key}
                        className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-40"
                      >
                        promote
                      </button>
                      <button
                        onClick={() => void discard(d.key)}
                        disabled={busyKey === d.key}
                        className="rounded border border-neutral-800 px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-900 hover:text-red-400 disabled:opacity-40"
                      >
                        discard
                      </button>
                    </div>
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
