import type { Metadata } from "next"
import "./globals.css"
import { SettingsBridge } from "@/components/settings-bridge"

export const metadata: Metadata = {
  title: "SixEyesCadiro",
  description: "Calm market analyzer for Path of Exile trade listings",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <SettingsBridge />
        {children}
      </body>
    </html>
  )
}
