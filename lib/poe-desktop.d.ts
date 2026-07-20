// The window.poeDesktop bridge exposed by electron/preload.js. Declared once
// here — multiple `declare global` blocks across files must agree on the
// exact shape of the same property, so this is the single source of truth.

export {}

declare global {
  interface Window {
    poeDesktop?: {
      isDesktop: boolean
      login: () => Promise<{ ok: boolean; valid: boolean; reason?: string }>
      version: () => Promise<string>
      checkForUpdate: () => Promise<
        { available: false; current: string } | { available: true; current: string; latest: string; url: string }
      >
      reportError: (message: string, stack?: string) => Promise<{ ok: boolean; logPath: string }>
      uninstall: () => Promise<{ ok: boolean; cancelled?: boolean; unsupported?: boolean; error?: string }>
      /** File -> Settings was clicked; returns an unsubscribe function. */
      onOpenSettings: (cb: () => void) => () => void
    }
  }
}
