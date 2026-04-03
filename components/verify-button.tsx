'use client'
import { useState } from 'react'
import { MiniKit, VerificationLevel } from '@worldcoin/minikit-js'
import type { ISuccessResult } from '@worldcoin/minikit-js'
import { WORLD_ID_ACTION } from '@/lib/constants'
import { USE_MOCK, MOCK_VERIFY } from '@/lib/mock-data'

interface Props {
  onVerified: (userId: string, walletAddress: string) => void
}

export function VerifyButton({ onVerified }: Props) {
  const [loading, setLoading] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleVerify = async () => {
    setError(null)
    setLoading(true)
    try {
      if (USE_MOCK) {
        // Dev mode: bypass MiniKit, hit real API with mock payload
        await new Promise(r => setTimeout(r, 600)) // simulate latency
        setVerified(true)
        onVerified(MOCK_VERIFY.userId, MOCK_VERIFY.walletAddress)
        return
      }

      if (!MiniKit.isInstalled()) {
        setError('Open this app inside World App to verify.')
        return
      }

      const { finalPayload } = await MiniKit.commandsAsync.verify({
        action: WORLD_ID_ACTION, // 'register-agent' — must match Developer Portal
        verification_level: VerificationLevel.Orb,
      })

      if (finalPayload.status === 'error') {
        setError('Verification cancelled.')
        return
      }

      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: finalPayload as ISuccessResult,
          action: WORLD_ID_ACTION,
        }),
      })

      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}))
        setError(msg ?? 'Verification failed. Try again.')
        return
      }

      const data = await res.json()
      if (data.verified) {
        setVerified(true)
        onVerified(data.userId, data.walletAddress)
      } else {
        setError('Proof rejected. Try again.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <button
        onClick={handleVerify}
        disabled={loading || verified}
        className={`w-full py-4 rounded-2xl font-bold text-lg transition-all active:scale-95 ${
          verified
            ? 'bg-green-500 text-white'
            : loading
            ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
            : 'bg-black text-white'
        }`}
      >
        {loading ? 'Verifying...' : verified ? 'Verified Human' : 'Verify with World ID'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-500 text-center">{error}</p>
      )}
    </div>
  )
}
