'use client'
import { useState } from 'react'
import { MiniKit } from '@worldcoin/minikit-js'
import { WORLD_ID_ACTION } from '@/lib/constants'
import { fetchJson } from '@/components/sync4-client'

interface Props {
  onVerified: (userId: string, walletAddress: string) => void
}

type VerificationPayload = {
  status?: string
  [key: string]: unknown
}

type LegacyVerifyCommand = (options: {
  action: string
  verification_level: 'orb'
}) => Promise<unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getVerifyCommand(): LegacyVerifyCommand | null {
  const candidate =
    (MiniKit as { verify?: LegacyVerifyCommand }).verify ??
    (MiniKit as {
      commandsAsync?: { verify?: LegacyVerifyCommand }
      commands?: { verify?: LegacyVerifyCommand }
    }).commandsAsync?.verify ??
    (MiniKit as {
      commands?: { verify?: LegacyVerifyCommand }
    }).commands?.verify

  return typeof candidate === 'function' ? candidate : null
}

function extractPayload(result: unknown): VerificationPayload | null {
  if (!isRecord(result)) return null

  if (isRecord(result.finalPayload)) {
    return result.finalPayload as VerificationPayload
  }

  if (isRecord(result.data)) {
    return result.data as VerificationPayload
  }

  return null
}

const isInWorldApp = () => {
  try {
    return MiniKit.isInstalled()
  } catch {
    return false
  }
}

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export function VerifyButton({ onVerified }: Props) {
  const [loading, setLoading] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDemoLogin = async () => {
    setError(null)
    setLoading(true)
    try {
      const data = await fetchJson<{
        verified: boolean
        userId: string
        walletAddress: string
      }>('/api/demo-login', { method: 'POST' })

      if (data.verified) {
        setVerified(true)
        onVerified(data.userId, data.walletAddress)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleMiniKitVerify = async () => {
    setError(null)
    setLoading(true)

    try {
      if (!MiniKit.isInstalled()) {
        setError('Open this app inside World App to verify.')
        return
      }

      const verifyCommand = getVerifyCommand()
      if (!verifyCommand) {
        setError('World ID verification is unavailable in this World App SDK build.')
        return
      }

      const result = await verifyCommand({
        action: WORLD_ID_ACTION,
        verification_level: 'orb',
      })

      const finalPayload = extractPayload(result)
      if (!finalPayload) {
        setError('Verification payload missing. Try again inside World App.')
        return
      }

      if (finalPayload.status === 'error') {
        setError('Verification cancelled.')
        return
      }

      const worldAppWalletAddress = MiniKit.user?.walletAddress ?? ''
      const data = await fetchJson<{
        verified: boolean
        userId: string
        walletAddress: string
      }>('/api/verify', {
        method: 'POST',
        body: JSON.stringify({
          payload: finalPayload,
          action: WORLD_ID_ACTION,
          signal: worldAppWalletAddress || undefined,
        }),
      })

      if (data.verified) {
        setVerified(true)
        onVerified(data.userId, data.walletAddress || worldAppWalletAddress)
      } else {
        setError('Proof rejected. Try again.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const inWorldApp = isInWorldApp()

  // Determine which handler to use
  const handleVerify = inWorldApp ? handleMiniKitVerify : isDemoMode ? handleDemoLogin : handleMiniKitVerify

  const buttonLabel = loading
    ? 'Verifying...'
    : verified
    ? 'Verified Human'
    : inWorldApp
    ? 'Verify with World ID'
    : isDemoMode
    ? 'Continue as Demo User'
    : 'Verify with World ID'

  return (
    <div className="w-full space-y-3">
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
        {buttonLabel}
      </button>

      {/* Show demo option as secondary when not in World App and demo is enabled */}
      {!inWorldApp && isDemoMode && !verified && (
        <p className="text-center text-xs text-stone-400">
          Demo mode — no World App required
        </p>
      )}

      {/* If not in World App and not demo mode, show helpful message */}
      {!inWorldApp && !isDemoMode && !verified && (
        <p className="text-center text-xs text-stone-400">
          Open this link in World App to verify, or enable demo mode for testing.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-500 text-center">{error}</p>
      )}
    </div>
  )
}
