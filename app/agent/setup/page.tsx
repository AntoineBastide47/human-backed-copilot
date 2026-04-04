'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { IDKitRequestWidget, orbLegacy, type IDKitResult } from '@worldcoin/idkit'
import { fetchJson } from '@/components/sync4-client'
import type { Agent, WorldIdOnChainProof } from '@/types'
import type { RpContext } from '@worldcoin/idkit'
import {
  getLocalStorageValue,
  setLocalStorageValue,
} from '@/lib/client-storage'

type SetupStatus = 'idle' | 'submitting' | 'verifying' | 'registering' | 'active' | 'error'

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

// ── Step tracker ────────────────────────────────────────────────────────

function StepTracker({ setupStatus }: { setupStatus: SetupStatus }) {
  const steps = isDemoMode
    ? [
        { key: 'submit', label: 'Creating agent' },
        { key: 'active', label: 'Agent active' },
      ]
    : [
        { key: 'submit', label: 'Preparing verification' },
        { key: 'verifying', label: 'World ID verification' },
        { key: 'registering', label: 'Registering on-chain' },
        { key: 'active', label: 'Agent active' },
      ]

  const statusOrder: SetupStatus[] = isDemoMode
    ? ['submitting', 'active']
    : ['submitting', 'verifying', 'registering', 'active']

  const activeIdx = statusOrder.indexOf(setupStatus)

  return (
    <div className="space-y-2 py-2">
      {steps.map((step, i) => {
        const done = i < activeIdx || setupStatus === 'active'
        const current = i === activeIdx && setupStatus !== 'active'
        return (
          <div key={step.key} className="flex items-center gap-3">
            <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${
              done    ? 'bg-green-500 text-white' :
              current ? 'bg-black text-white'     :
                        'bg-stone-100 text-stone-400'
            }`}>
              {done ? '\u2713' : i + 1}
            </span>
            <span className={`text-sm ${current ? 'font-semibold' : done ? 'text-stone-400 line-through' : 'text-stone-400'}`}>
              {step.label}
              {current && <span className="ml-1 inline-block animate-pulse">...</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────────

export default function AgentSetupPage() {
  const router = useRouter()
  const [walletAddress, setWalletAddress] = useState('')
  const [ensName, setEnsName] = useState('')
  const [setupStatus, setSetupStatus] = useState<SetupStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  // IDKit widget state
  const [idkitOpen, setIdkitOpen] = useState(false)
  const [rpContext, setRpContext] = useState<RpContext | null>(null)
  const [appId, setAppId] = useState<`app_${string}` | null>(null)
  const [action, setAction] = useState<string>('')

  // Store proof from IDKit for use after widget closes
  const proofRef = useRef<WorldIdOnChainProof | null>(null)

  // Navigate once active
  useEffect(() => {
    if (setupStatus !== 'active') return
    const t = setTimeout(() => router.push('/agent/strategies'), 1400)
    return () => clearTimeout(t)
  }, [setupStatus, router])

  // ── Demo mode submit ────────────────────────────────────────────────

  const handleDemoSubmit = async () => {
    setError(null)
    setSetupStatus('submitting')

    try {
      const agent = await fetchJson<Agent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify({ walletAddress, ensName: ensName || undefined }),
      })

      setLocalStorageValue('hbc_agentId', agent.id)
      setSetupStatus('active')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setSetupStatus('error')
    }
  }

  // ── Production submit: prepare → open IDKit ─────────────────────────

  const handleProdSubmit = async () => {
    setError(null)
    setSetupStatus('submitting')

    try {
      const userId = getLocalStorageValue('hbc_userId')
      if (!userId) {
        setError('Not verified. Go back and verify with World ID first.')
        setSetupStatus('error')
        return
      }

      // Get signed rp_context from backend
      const prepared = await fetchJson<{
        rp_context: RpContext
        app_id: string
        action: string
      }>('/api/agents/prepare', { method: 'POST' })

      setRpContext(prepared.rp_context)
      setAppId(prepared.app_id as `app_${string}`)
      setAction(prepared.action)
      setSetupStatus('verifying')
      setIdkitOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prepare verification')
      setSetupStatus('error')
    }
  }

  // ── IDKit handleVerify: called when proof is ready, before onSuccess ─

  const handleVerify = useCallback(async (result: IDKitResult) => {
    // Extract legacy v3 proof fields
    const responses = result.responses
    if (!responses || responses.length === 0) {
      throw new Error('No proof responses from IDKit')
    }

    const resp = responses[0]
    // v3 legacy response has proof/merkle_root/nullifier as direct fields
    const v3 = resp as { proof?: string; merkle_root?: string; nullifier?: string }
    if (v3.proof && v3.merkle_root && v3.nullifier) {
      proofRef.current = {
        proof: v3.proof,
        merkle_root: v3.merkle_root,
        nullifier_hash: v3.nullifier,
      }
    } else {
      throw new Error('Unexpected proof format from IDKit')
    }
  }, [])

  // ── IDKit onSuccess: proof verified, now register on-chain ──────────

  const handleIdkitSuccess = useCallback(async () => {
    const proof = proofRef.current
    if (!proof) {
      setError('No proof available after verification')
      setSetupStatus('error')
      return
    }

    setSetupStatus('registering')

    try {
      const agent = await fetchJson<Agent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify({
          walletAddress,
          ensName: ensName || undefined,
          proof,
        }),
      })

      setLocalStorageValue('hbc_agentId', agent.id)
      setSetupStatus('active')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'On-chain registration failed')
      setSetupStatus('error')
    }
  }, [walletAddress, ensName])

  // ── Form submit handler ─────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const userId = getLocalStorageValue('hbc_userId')
    if (!userId) {
      setError('Not verified. Go back and verify with World ID first.')
      setSetupStatus('error')
      return
    }

    if (isDemoMode) {
      await handleDemoSubmit()
    } else {
      await handleProdSubmit()
    }
  }

  const isProcessing = setupStatus !== 'idle' && setupStatus !== 'error'
  const isDone = setupStatus === 'active'

  return (
    <div className="min-h-screen px-5 pt-8 pb-4">
      <h1 className="text-xl font-bold mb-1">Register Agent</h1>
      <p className="text-sm text-stone-500 mb-6">
        Your agent wallet will execute trades on your behalf on World Chain.
      </p>

      {setupStatus !== 'idle' ? (
        <div className="space-y-6">
          <StepTracker setupStatus={setupStatus} />
          {isDone && (
            <p className="text-sm text-green-600 font-medium text-center">
              Agent active — heading to strategies...
            </p>
          )}
          {setupStatus === 'error' && error && (
            <div className="space-y-3">
              <p role="alert" className="text-center text-sm text-red-500">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setSetupStatus('idle')
                  setError(null)
                  proofRef.current = null
                }}
                className="w-full rounded-2xl border border-stone-200 py-3 text-sm font-semibold text-stone-700"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Agent Wallet Address
            </label>
            <input
              type="text"
              value={walletAddress}
              onChange={e => setWalletAddress(e.target.value)}
              placeholder="0x..."
              required
              pattern="^0x[0-9a-fA-F]{40}$"
              className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-white text-sm font-mono placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-black"
            />
            <p className="mt-1 text-xs text-stone-400">
              Fund this wallet with ETH for gas on World Chain.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              ENS Name <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <div className="flex items-center border border-stone-200 rounded-xl bg-white overflow-hidden focus-within:ring-2 focus-within:ring-black">
              <input
                type="text"
                value={ensName}
                onChange={e => setEnsName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="my-agent"
                className="flex-1 px-4 py-3 text-sm bg-transparent focus:outline-none"
              />
              <span className="pr-4 text-sm text-stone-400 select-none">.copilot.eth</span>
            </div>
          </div>

          <div className="bg-stone-50 rounded-xl p-3 text-xs text-stone-500 space-y-1">
            <p className="font-semibold text-stone-700">Default spend limits</p>
            <p>Max per trade: $1,000 USDC - Daily cap: $5,000 USDC</p>
          </div>

          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={isProcessing}
            className="w-full py-4 rounded-2xl font-bold text-lg bg-black text-white active:scale-95 transition-all"
          >
            {isProcessing ? 'Registering...' : 'Register Agent'}
          </button>
        </form>
      )}

      {/* IDKit widget — rendered when rp_context is ready */}
      {rpContext && appId && action && (
        <IDKitRequestWidget
          app_id={appId}
          action={action}
          rp_context={rpContext}
          preset={orbLegacy({ signal: walletAddress })}
          allow_legacy_proofs={true}
          open={idkitOpen}
          onOpenChange={setIdkitOpen}
          handleVerify={handleVerify}
          onSuccess={handleIdkitSuccess}
          onError={(code) => {
            setError(`World ID verification failed: ${code}`)
            setSetupStatus('error')
          }}
        />
      )}
    </div>
  )
}
