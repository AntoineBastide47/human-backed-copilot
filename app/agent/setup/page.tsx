'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchJson } from '@/components/sync4-client'
import type { Agent } from '@/types'
import {
  getLocalStorageValue,
  setLocalStorageValue,
} from '@/lib/client-storage'

type SetupStatus = 'idle' | 'submitting' | 'active' | 'error'

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

function StepTracker({ setupStatus }: { setupStatus: SetupStatus }) {
  const steps = isDemoMode
    ? [
        { key: 'submit', label: 'Creating agent' },
        { key: 'active', label: 'Agent active' },
      ]
    : [
        { key: 'cli', label: 'Register with AgentKit CLI' },
        { key: 'submit', label: 'Create agent' },
        { key: 'active', label: 'Agent active' },
      ]

  const activeIdx = isDemoMode
    ? (setupStatus === 'active' ? 1 : 0)
    : setupStatus === 'active'
      ? 2
      : setupStatus === 'submitting'
        ? 1
        : 0

  return (
    <div className="space-y-2 py-2">
      {steps.map((step, i) => {
        const done = i < activeIdx || setupStatus === 'active'
        const current = i === activeIdx && setupStatus !== 'active'

        return (
          <div key={step.key} className="flex items-center gap-3">
            <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${
              done ? 'bg-green-500 text-white' :
              current ? 'bg-black text-white' :
              'bg-stone-100 text-stone-400'
            }`}>
              {done ? '\u2713' : i + 1}
            </span>
            <span className={`text-sm ${
              current ? 'font-semibold' :
              done ? 'text-stone-400 line-through' :
              'text-stone-400'
            }`}>
              {step.label}
              {current && <span className="ml-1 inline-block animate-pulse">...</span>}
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

  useEffect(() => {
    const storedWalletAddress = getLocalStorageValue('hbc_walletAddress')
    if (!storedWalletAddress) return
    setWalletAddress((current) => current || storedWalletAddress)
  }, [])

  useEffect(() => {
    if (setupStatus !== 'active') return
    const t = setTimeout(() => router.push('/agent/strategies'), 1400)
    return () => clearTimeout(t)
  }, [setupStatus, router])

  const cliCommand = /^0x[0-9a-fA-F]{40}$/.test(walletAddress)
    ? `npx @worldcoin/agentkit-cli register ${walletAddress}`
    : 'npx @worldcoin/agentkit-cli register 0xYourAgentWallet'

  async function createAgent() {
    const agent = await fetchJson<Agent>('/api/agents', {
      method: 'POST',
      body: JSON.stringify({ ensName: ensName || undefined }),
    })

    setLocalStorageValue('hbc_agentId', agent.id)
    setSetupStatus('active')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSetupStatus('submitting')

    const userId = getLocalStorageValue('hbc_userId')
    if (!userId) {
      setError('Not verified. Go back and verify with World ID first.')
      setSetupStatus('error')
      return
    }

    if (!walletAddress) {
      setError('Missing verified World wallet. Go back and log in with World App first.')
      setSetupStatus('error')
      return
    }

    try {
      await createAgent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent')
      setSetupStatus('error')
    }
  }

  const isProcessing = setupStatus === 'submitting'
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
              <pre
                role="alert"
                className="text-left text-xs text-red-500 whitespace-pre-wrap break-all overflow-auto max-h-60"
              >
                {error}
              </pre>
              <button
                type="button"
                onClick={() => {
                  setSetupStatus('idle')
                  setError(null)
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
            <label htmlFor="agent-wallet-address" className="block text-sm font-medium text-stone-700 mb-1">
              World Wallet Address
            </label>
            <input
              id="agent-wallet-address"
              type="text"
              value={walletAddress}
              placeholder="0x..."
              readOnly
              className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-white text-sm font-mono placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-black"
            />
            <p className="mt-1 text-xs text-stone-400">
              {walletAddress
                ? 'Locked to the wallet you verified with World App. Fund this wallet with ETH for gas on World Chain.'
                : 'Verify with World App first so we can load your wallet here.'}
            </p>
          </div>

          <div>
            <label htmlFor="agent-ens-name" className="block text-sm font-medium text-stone-700 mb-1">
              ENS Name <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <div className="flex items-center border border-stone-200 rounded-xl bg-white overflow-hidden focus-within:ring-2 focus-within:ring-black">
              <input
                id="agent-ens-name"
                type="text"
                value={ensName}
                onChange={(e) => setEnsName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="my-agent"
                className="flex-1 px-4 py-3 text-sm bg-transparent focus:outline-none"
              />
              <span className="pr-4 text-sm text-stone-400 select-none">.copilot.eth</span>
            </div>
          </div>

          {!isDemoMode && (
            <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm font-semibold text-stone-800">
                Step 1: Register this wallet with AgentKit CLI
              </p>
              <p className="text-xs text-stone-600">
                Run this command in your terminal, complete the World App verification flow, then return here and create the agent.
              </p>
              <pre className="overflow-auto rounded-xl bg-stone-900 px-3 py-3 text-xs text-stone-100 whitespace-pre-wrap break-all">
                {cliCommand}
              </pre>
            </div>
          )}

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
            {isProcessing
              ? 'Checking registration...'
              : isDemoMode
                ? 'Create Agent'
                : 'Check Registration & Create Agent'}
          </button>
        </form>
      )}
    </div>
  )
}
