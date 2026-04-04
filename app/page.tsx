'use client'
import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { VerifyButton } from '@/components/verify-button'
import { readStoredValue, STORAGE_KEYS, writeStoredValue } from '@/components/sync4-client'

function subscribeToStorage() {
  return () => {}
}

export default function HomePage() {
  const storedUserId = useSyncExternalStore(
    subscribeToStorage,
    () => readStoredValue(STORAGE_KEYS.userId),
    () => null
  )
  const [userIdOverride, setUserIdOverride] = useState<string | null | undefined>(undefined)
  const userId = userIdOverride ?? storedUserId

  const handleVerified = (uid: string, walletAddress: string) => {
    writeStoredValue(STORAGE_KEYS.userId, uid)
    writeStoredValue(STORAGE_KEYS.walletAddress, walletAddress)
    setUserIdOverride(uid)
  }

  return (
    <div className="min-h-screen flex flex-col px-5 pt-12 pb-8">
      <div className="flex-1 flex flex-col justify-center gap-6">
        <div>
          <span className="inline-block px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full mb-4">
            World ID + Uniswap + ENS
          </span>
          <h1 className="text-3xl font-bold leading-tight text-stone-900">
            Human-Backed<br />Trading Copilot
          </h1>
          <p className="mt-3 text-stone-500 text-base leading-relaxed">
            Register an AI trading agent. It proposes swaps — you approve them.
            Bots blocked. Verified humans only.
          </p>
        </div>

        <ul className="space-y-2 text-sm text-stone-600">
          {[
            'Verified by World ID — one unique human per agent',
            'DCA & rebalance strategies on World Chain',
            'Human approval required for every trade',
            'ENS subname for your agent (*.copilot.eth)',
          ].map(f => (
            <li key={f} className="flex items-start gap-2">
              <span className="mt-0.5 w-4 h-4 rounded-full bg-green-500 flex-shrink-0 flex items-center justify-center">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 space-y-3">
        {userId ? (
          <>
            <p className="text-center text-sm text-green-600 font-medium">
              Verified human detected. Continue Sync #4 live.
            </p>
            <Link
              href="/agent/setup"
              className="block w-full py-4 rounded-2xl font-bold text-lg text-center bg-black text-white active:scale-95 transition-all"
            >
              Set Up Your Agent
            </Link>
            <Link
              href="/dashboard"
              className="block w-full py-4 rounded-2xl font-bold text-lg text-center bg-stone-100 text-stone-700 active:scale-95 transition-all"
            >
              View Dashboard
            </Link>
          </>
        ) : (
          <VerifyButton onVerified={handleVerified} />
        )}
        <p className="text-center text-xs text-stone-400">
          Runs on World Chain (chain ID 480)
        </p>
      </div>
    </div>
  )
}
