import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { MiniKitProvider } from '@/components/minikit-provider'
import { NavTabs } from '@/components/nav-tabs'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })

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
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900 font-sans">
        <MiniKitProvider>
          <main className="flex-1 pb-14">{children}</main>
          <NavTabs />
        </MiniKitProvider>
      </body>
    </html>
  )
}
