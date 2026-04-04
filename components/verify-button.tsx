'use client'
import { useState, useEffect } from 'react'
import { MiniKit } from '@worldcoin/minikit-js'
import { fetchJson } from '@/components/sync4-client'

interface Props {
  onVerified: (userId: string, walletAddress: string) => void
}

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export function VerifyButton({ onVerified }: Props) {
  const [loading, setLoading] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inWorldApp, setInWorldApp] = useState(false)

  useEffect(() => {
    // Re-check after MiniKit.install() has run in the provider
    const check = () => {
      try { setInWorldApp(MiniKit.isInstalled()) } catch { /* not installed */ }
    }
    check()
    // MiniKit.install() in the provider may run after this effect; retry once
    const timer = setTimeout(check, 100)
    return () => clearTimeout(timer)
  }, [])

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

  const handleWorldAppVerify = async () => {
    setError(null)
    setLoading(true)

    try {
      if (!MiniKit.isInstalled()) {
        setError('Open this app inside World App to verify.')
        return
      }

      // Use walletAuth to authenticate the user via SIWE
      const nonce = crypto.randomUUID().replace(/-/g, '')
      const result = await MiniKit.walletAuth({
        nonce,
        statement: 'Verify your identity for Human-Backed Trading Copilot',
        expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })

      const walletAddress = result.data.address

      // Send to backend for verification and session creation
      const data = await fetchJson<{
        verified: boolean
        userId: string
        walletAddress: string
      }>('/api/verify', {
        method: 'POST',
        body: JSON.stringify({
          payload: {
            address: walletAddress,
            message: result.data.message,
            signature: result.data.signature,
            nonce,
          },
          walletAuth: true,
        }),
      })

      if (data.verified) {
        setVerified(true)
        onVerified(data.userId, data.walletAddress)
      } else {
        setError('Verification failed. Try again.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = inWorldApp ? handleWorldAppVerify : isDemoMode ? handleDemoLogin : handleWorldAppVerify

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
        className={`w-full py-5 rounded-xl font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition-transform shadow-lg text-sm tracking-wide ${
          verified
            ? 'bg-tertiary text-on-tertiary'
            : loading
            ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
            : 'bg-[#162238] text-white shadow-secondary/20'
        }`}
      >
        {buttonLabel}
      </button>

      {!inWorldApp && isDemoMode && !verified && (
        <p className="text-center text-xs text-on-surface-variant/60">
          Demo mode — no World App required
        </p>
      )}

      {!inWorldApp && !isDemoMode && !verified && (
        <p className="text-center text-xs text-on-surface-variant/60">
          Open this link in World App to verify, or enable demo mode for testing.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-error text-center">{error}</p>
      )}
    </div>
  )
}
