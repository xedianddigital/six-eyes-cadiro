"use client"

// The Import tab: the only way anything gets onto Tracked now, whether one
// at a time (the form below) or in bulk (a markdown file — see
// docs/starter-picks.md for the format). Everything sits as a draft until a
// manual "promote", so nothing you add here silently starts polling GGG.

import { useRef, useState } from "react"
import { ago, sendJson, type DraftModel } from "./api"
import { useConfirm } from "./confirm-dialog"

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
  const [itemName, setItemName] = useState("")
  const [notes, setNotes] = useState("")
  const [url, setUrl] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const atCap = trackedCount >= maxTracked
  const { confirm, dialog } = useConfirm()

  const addOne = async () => {
    setAddError(null)
    try {
      await sendJson("/api/drafts", "POST", { itemName, notes, url })
      setItemName("")
      setNotes("")
      setUrl("")
      onChanged()
    } catch (err) {
      setAddError((err as Error).message)
    }
  }

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

  const clearAll = async () => {
    const ok = await confirm(`Discard all ${drafts.length} draft${drafts.length === 1 ? "" : "s"}? This can't be undone.`, {
      danger: true,
      okLabel: "Discard all",
    })
    if (!ok) return
    await sendJson("/api/drafts", "DELETE")
    onChanged()
  }

  const groups = new Map<string, DraftModel[]>()
  for (const d of drafts) {
    const list = groups.get(d.itemName) ?? []
    list.push(d)
    groups.set(d.itemName, list)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-neutral-700 bg-[#1a1a1a] p-4">
        <div className="mb-2 font-medium text-neutral-100">Add one</div>
        <div className="flex flex-wrap gap-2">
          <input
            className="w-64 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm placeholder:text-neutral-600"
            placeholder="Name"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
          />
          <input
            className="w-56 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm placeholder:text-neutral-600"
            placeholder="Details (optional — e.g. specific roll)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <input
            className="min-w-64 flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm placeholder:text-neutral-600"
            placeholder="https://www.pathofexile.com/trade/search/Mirage/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addOne()
            }}
          />
          <button
            onClick={() => void addOne()}
            disabled={!itemName.trim() || !url.trim()}
            className="rounded border border-neutral-700 px-4 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
          >
            Add
          </button>
        </div>
        {addError ? <div className="mt-2 text-xs text-red-400">{addError}</div> : null}
      </div>

      <div className="rounded-lg border border-neutral-700 bg-[#1a1a1a]">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
          <div>
            <span className="font-medium text-neutral-100">Import</span>
            <span className="ml-2 text-xs text-neutral-400">
              {drafts.length} draft{drafts.length === 1 ? "" : "s"} waiting
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
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              Import file
            </button>
            {drafts.length > 0 ? (
              <button
                onClick={() => void clearAll()}
                className="rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
              >
                Clear all
              </button>
            ) : null}
          </div>
        </div>

        {message ? <div className="border-b border-neutral-800 px-4 py-2 text-xs text-neutral-400">{message}</div> : null}

        {atCap ? (
          <div className="border-b border-neutral-800 px-4 py-2 text-xs text-amber-500">
            At the {maxTracked}-search cap — remove something from Tracked before promoting more.
          </div>
        ) : null}

        {drafts.length === 0 ? (
          <div className="px-4 py-6 text-sm text-neutral-400">
            No drafts yet. Add one above, or import a .md list — see docs/starter-picks.md for the format.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-400">
                <th className="px-4 py-2 font-normal">item</th>
                <th className="w-1/4 px-2 py-2 font-normal">variant</th>
                <th className="px-4 py-2 text-right font-normal">actions</th>
                <th className="px-4 py-2 text-right font-normal">added</th>
              </tr>
            </thead>
            <tbody>
              {[...groups.entries()].map(([itemName, rows]) =>
                rows.map((d, i) => (
                  <tr key={d.key} className="border-t border-neutral-800 hover:bg-neutral-800/60">
                    <td className="max-w-[220px] truncate px-4 py-2 text-neutral-200">
                      {i === 0 ? itemName : <span className="text-neutral-500">···</span>}
                    </td>
                    <td className="px-2 py-2 text-neutral-300" title={d.notes || undefined}>
                      {d.variant || <span className="text-neutral-500">—</span>}
                      {d.notes ? <span className="ml-1 text-neutral-500">· {d.notes}</span> : null}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700"
                        >
                          open
                        </a>
                        <button
                          onClick={() => void promote(d.key)}
                          disabled={atCap || busyKey === d.key}
                          className="rounded border border-neutral-600 px-2 py-0.5 text-xs text-neutral-100 hover:bg-neutral-700 disabled:opacity-40"
                        >
                          promote
                        </button>
                        <button
                          onClick={() => void discard(d.key)}
                          disabled={busyKey === d.key}
                          className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-700 hover:text-red-400 disabled:opacity-40"
                        >
                          discard
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-neutral-500">{ago(d.addedAt)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}
      </div>

      {dialog}
    </div>
  )
}
