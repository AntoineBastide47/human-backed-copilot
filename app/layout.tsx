import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthExpiryHandler } from '@/components/auth-expiry-handler'
import { MiniKitProvider } from '@/components/minikit-provider'
import { NavTabs } from '@/components/nav-tabs'
import { TopAppBar } from '@/components/top-app-bar'

export const metadata: Metadata = {
  title: 'Human-Backed Copilot',
  description: 'AI trading agents verified by World ID',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className="min-h-screen bg-background text-on-surface antialiased">
        <MiniKitProvider>
          <AuthExpiryHandler />
          <TopAppBar />
          <div className="pt-16 pb-28">{children}</div>
          <NavTabs />
        </MiniKitProvider>
      </body>
    </html>
  )
}
