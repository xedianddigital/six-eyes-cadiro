"use client"

// App-styled stand-in for the browser's native confirm()/alert() — those
// render as an ugly unstyled OS dialog that breaks the app's look. Promise-
// based so call sites read like the native calls they replace:
//   if (!(await confirm("Remove this?"))) return

import { useCallback, useEffect, useState } from "react"

interface DialogState {
  message: string
  resolve: (v: boolean) => void
  danger?: boolean
  okLabel?: string
  cancelable: boolean
}

export function useConfirm() {
  const [state, setState] = useState<DialogState | null>(null)

  const respond = useCallback(
    (value: boolean) => {
      setState((s) => {
        s?.resolve(value)
        return null
      })
    },
    [],
  )

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.cancelable) respond(false)
      if (e.key === "Enter") respond(true)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [state, respond])

  const confirm = useCallback(
    (message: string, opts?: { danger?: boolean; okLabel?: string }) =>
      new Promise<boolean>((resolve) => {
        setState({ message, resolve, danger: opts?.danger, okLabel: opts?.okLabel, cancelable: true })
      }),
    [],
  )

  const alert = useCallback(
    (message: string) =>
      new Promise<void>((resolve) => {
        setState({ message, resolve: () => resolve(), cancelable: false })
      }),
    [],
  )

  const dialog = state ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-700 bg-[#1a1a1a] p-4 shadow-xl">
        <p className="mb-4 whitespace-pre-line text-sm text-neutral-200">{state.message}</p>
        <div className="flex justify-end gap-2">
          {state.cancelable ? (
            <button
              onClick={() => respond(false)}
              className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </button>
          ) : null}
          <button
            autoFocus
            onClick={() => respond(true)}
            className={`rounded border px-3 py-1 text-xs ${
              state.danger
                ? "border-red-900 text-red-400 hover:bg-red-950"
                : "border-neutral-600 text-neutral-100 hover:bg-neutral-800"
            }`}
          >
            {state.okLabel ?? (state.cancelable ? "Remove" : "OK")}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, alert, dialog }
}
