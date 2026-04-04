'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { fetchJson, toTokenAmount, tokenSymbol } from '@/components/sync4-client'
import { useAgentId } from '@/components/use-agent-id'
import { WORLD_CHAIN_ID } from '@/lib/constants'

const TOKEN_PAIRS = [
  { label: 'WETH → USDC', tokenIn: '0x4200000000000000000000000000000000000006', tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1' },
  { label: 'USDC → WETH', tokenIn: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1', tokenOut: '0x4200000000000000000000000000000000000006' },
  { label: 'WLD → USDC',  tokenIn: '0x163f8C2467924be0ae7B5347228CABF260318753', tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1' },
  { label: 'WBTC → USDC', tokenIn: '0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa', tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1' },
] as const

type Interval = 'hourly' | 'daily' | 'weekly'

export default function StrategiesPage() {
  const router = useRouter()
  const { agentId, hydrated, isResolving } = useAgentId()
  const [pairIdx, setPairIdx] = useState(0)
  const [amount, setAmount] = useState('')
  const [interval, setInterval] = useState<Interval>('daily')
  const [autoExecute, setAutoExecute] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const pair = TOKEN_PAIRS[pairIdx]
  const tokenInSymbol = tokenSymbol(pair.tokenIn)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setStatus('loading')

    try {
      if (!agentId) {
        setError('No agent found. Register an agent first.')
        setStatus('error')
        return
      }

      const amountRaw = toTokenAmount(amount, pair.tokenIn)

      await fetchJson(`/api/agents/${agentId}/strategies`, {
        method: 'POST',
        body: JSON.stringify({
          name: `${interval.charAt(0).toUpperCase() + interval.slice(1)} ${tokenInSymbol} DCA`,
          tokenIn: pair.tokenIn,
          tokenOut: pair.tokenOut,
          chainId: WORLD_CHAIN_ID,
          amountPerInterval: amountRaw,
          interval,
          autoExecute,
        }),
      })

      setStatus('done')
      setTimeout(() => router.push('/agent/proposals'), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }

  if (!agentId && isResolving) {
    return (
      <div className="min-h-screen px-5 pt-8 pb-4">
        <div className="space-y-3 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-bold">Add Strategy</h1>
          <p className="text-sm text-stone-500">
            Loading your registered agent so the live Sync #4 flow can continue.
          </p>
        </div>
      </div>
    )
  }

  if (!agentId && hydrated) {
    return (
      <div className="min-h-screen px-5 pt-8 pb-4">
        <div className="space-y-4 rounded-3xl border border-stone-200 bg-white p-5 text-center shadow-sm">
          <h1 className="text-xl font-bold">No Agent Found</h1>
          <p className="text-sm text-stone-500">
            Finish registration first, then come back here to create the live strategy.
          </p>
          <Link
            href="/agent/setup"
            className="block rounded-2xl bg-black py-3 text-sm font-semibold text-white"
          >
            Register Agent
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-5 pt-8 pb-4">
      <h1 className="text-xl font-bold mb-1">Add Strategy</h1>
      <p className="text-sm text-stone-500 mb-6">Define when and how your agent trades.</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">Token Pair</label>
          <select
            value={pairIdx}
            onChange={e => setPairIdx(Number(e.target.value))}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-white text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-black appearance-none"
          >
            {TOKEN_PAIRS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Amount per trade ({tokenInSymbol})
          </label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.5"
            step="any"
            min="0"
            required
            className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">Frequency</label>
          <div className="grid grid-cols-3 gap-2">
            {(['hourly', 'daily', 'weekly'] as Interval[]).map(iv => (
              <button
                key={iv}
                type="button"
                onClick={() => setInterval(iv)}
                className={`py-3 rounded-xl text-sm font-medium border transition-all capitalize ${
                  interval === iv ? 'border-black bg-black text-white' : 'border-stone-200 bg-white text-stone-700'
                }`}
              >
                {iv}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <div className="flex items-center justify-between">
            <div className="pr-4">
              <p className="text-sm font-semibold">Auto-execute</p>
              <p className="text-xs text-stone-400 mt-0.5">
                {autoExecute
                  ? 'Your agent trades without asking. Faster, but less control.'
                  : 'You approve each trade. Recommended for new strategies.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAutoExecute(v => !v)}
              className={`relative w-12 h-6 rounded-full overflow-hidden transition-colors flex-shrink-0 ${
                autoExecute ? 'bg-black' : 'bg-stone-200'
              }`}
              role="switch"
              aria-checked={autoExecute}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  autoExecute ? 'translate-x-[26px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
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
            ? 'Strategy live. Opening proposals...'
            : status === 'loading'
            ? 'Saving...'
            : 'Save Strategy'}
        </button>
      </form>
    </div>
  )
}
