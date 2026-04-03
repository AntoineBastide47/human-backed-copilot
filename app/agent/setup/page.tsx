'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { USE_MOCK, MOCK_AGENT } from '@/lib/mock-data'

export default function AgentSetupPage() {
  const router = useRouter()
  const [walletAddress, setWalletAddress] = useState('')
  const [ensName, setEnsName] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setStatus('loading')

    try {
      if (USE_MOCK) {
        await new Promise(r => setTimeout(r, 800))
        localStorage.setItem('hbc_agentId', MOCK_AGENT.id)
        setStatus('done')
        setTimeout(() => router.push('/agent/strategies'), 1200)
        return
      }

      const userId = localStorage.getItem('hbc_userId')
      if (!userId) {
        setError('Not verified. Go back and verify with World ID first.')
        setStatus('error')
        return
      }

      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, ensName: ensName || undefined }),
      })

      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}))
        throw new Error(msg ?? 'Registration failed')
      }

      const agent = await res.json()
      localStorage.setItem('hbc_agentId', agent.id)
      setStatus('done')
      setTimeout(() => router.push('/agent/strategies'), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen px-5 pt-8 pb-4">
      <h1 className="text-xl font-bold mb-1">Register Agent</h1>
      <p className="text-sm text-stone-500 mb-6">
        Your agent wallet will execute trades on your behalf on World Chain.
      </p>

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
          <p>Max per trade: $1,000 USDC</p>
          <p>Daily cap: $5,000 USDC</p>
        </div>

        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={status === 'loading' || status === 'done'}
          className={`w-full py-4 rounded-2xl font-bold text-lg transition-all active:scale-95 ${
            status === 'done'
              ? 'bg-green-500 text-white'
              : status === 'loading'
              ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
              : 'bg-black text-white'
          }`}
        >
          {status === 'done'
            ? 'Registered — next: strategies'
            : status === 'loading'
            ? 'Registering...'
            : 'Register Agent'}
        </button>
      </form>
    </div>
  )
}
