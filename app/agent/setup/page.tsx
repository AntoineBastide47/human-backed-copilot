'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { USE_MOCK, MOCK_AGENT, apiFetch } from '@/lib/mock-data'
import type { Agent } from '@/types'
import {
  getLocalStorageValue,
  setLocalStorageValue,
} from '@/lib/client-storage'

type SetupStatus = 'idle' | 'submitting' | 'registering' | 'active' | 'timeout' | 'error'

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 30 // 60s total

function StepTracker({ setupStatus }: { setupStatus: SetupStatus }) {
  const steps = [
    { key: 'submit',     label: 'Submitting to AgentBook' },
    { key: 'registering', label: 'Registering on-chain'   },
    { key: 'active',     label: 'Agent active'             },
  ]

  const activeIdx =
    setupStatus === 'idle'        ? -1 :
    setupStatus === 'submitting'  ? 0  :
    setupStatus === 'registering' ? 1  :
    setupStatus === 'active'      ? 2  : 0

  return (
    <div className="space-y-2 py-2">
      {steps.map((step, i) => {
        const done    = i < activeIdx || setupStatus === 'active'
        const current = i === activeIdx && setupStatus !== 'active'
        return (
          <div key={step.key} className="flex items-center gap-3">
            <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${
              done    ? 'bg-green-500 text-white' :
              current ? 'bg-black text-white'     :
                        'bg-stone-100 text-stone-400'
            }`}>
              {done ? '✓' : i + 1}
            </span>
            <span className={`text-sm ${current ? 'font-semibold' : done ? 'text-stone-400 line-through' : 'text-stone-400'}`}>
              {step.label}
              {current && <span className="ml-1 inline-block animate-pulse">…</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function AgentSetupPage() {
  const router = useRouter()
  const [walletAddress, setWalletAddress] = useState('')
  const [ensName, setEnsName] = useState('')
  const [setupStatus, setSetupStatus] = useState<SetupStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Poll for registering → active transition
  useEffect(() => {
    if (!agentId || setupStatus !== 'registering') return

    let attempts = 0

    const poll = async () => {
      try {
        const agent = await apiFetch<Agent>(`/api/agents/${agentId}`)
        if (agent.status === 'active') {
          setSetupStatus('active')
          return
        }
        if (++attempts >= POLL_MAX_ATTEMPTS) {
          setSetupStatus('timeout')
          return
        }
        pollRef.current = setTimeout(poll, POLL_INTERVAL_MS)
      } catch {
        setSetupStatus('error')
        setError('Could not verify agent status. Check the dashboard.')
      }
    }

    pollRef.current = setTimeout(poll, POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [agentId, setupStatus])

  // Navigate once active
  useEffect(() => {
    if (setupStatus !== 'active') return
    const t = setTimeout(() => router.push('/agent/strategies'), 1400)
    return () => clearTimeout(t)
  }, [setupStatus, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSetupStatus('submitting')

    try {
      if (USE_MOCK) {
        await new Promise(r => setTimeout(r, 600))
        setLocalStorageValue('hbc_agentId', MOCK_AGENT.id)
        setAgentId(MOCK_AGENT.id)
        setSetupStatus('registering')
        // Simulate on-chain delay
        await new Promise(r => setTimeout(r, 1200))
        setSetupStatus('active')
        return
      }

      const userId = getLocalStorageValue('hbc_userId')
      if (!userId) {
        setError('Not verified. Go back and verify with World ID first.')
        setSetupStatus('error')
        return
      }

      const agent = await apiFetch<Agent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify({ walletAddress, ensName: ensName || undefined }),
      })

      setLocalStorageValue('hbc_agentId', agent.id)
      setAgentId(agent.id)
      setSetupStatus('registering')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setSetupStatus('error')
    }
  }

  const isProcessing = setupStatus === 'submitting' || setupStatus === 'registering'
  const isDone = setupStatus === 'active'

  return (
    <div className="min-h-screen px-5 pt-8 pb-4">
      <h1 className="text-xl font-bold mb-1">Register Agent</h1>
      <p className="text-sm text-stone-500 mb-6">
        Your agent wallet will execute trades on your behalf on World Chain.
      </p>

      {isProcessing || isDone ? (
        <div className="space-y-6">
          <StepTracker setupStatus={setupStatus} />
          {isDone && (
            <p className="text-sm text-green-600 font-medium text-center">
              Agent active — heading to strategies…
            </p>
          )}
          {setupStatus === 'timeout' && (
            <p className="text-sm text-yellow-600 text-center">
              Taking longer than expected. Check the dashboard in a moment.
            </p>
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
            <p>Max per trade: $1,000 USDC · Daily cap: $5,000 USDC</p>
          </div>

          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            className="w-full py-4 rounded-2xl font-bold text-lg bg-black text-white active:scale-95 transition-all"
          >
            Register Agent
          </button>
        </form>
      )}
    </div>
  )
}
