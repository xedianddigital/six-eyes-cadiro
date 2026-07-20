"use client"

// Listens for File -> Settings from the desktop shell and navigates there.
// Lives in the root layout so it's active no matter which page is showing.

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function SettingsBridge() {
  const router = useRouter()

  useEffect(() => {
    if (!window.poeDesktop) return
    return window.poeDesktop.onOpenSettings(() => router.push("/settings"))
  }, [router])

  return null
}
