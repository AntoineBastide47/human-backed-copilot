'use client'
import Link from 'next/link'
import useSWR from 'swr'
import { USE_MOCK, MOCK_AGENT, MOCK_STRATEGIES, apiFetch } from '@/lib/mock-data'
import type { Agent, AgentStrategy } from '@/types'
import { useLocalStorageValue } from '@/lib/client-storage'

const fetchAgent = (url: string) => apiFetch<Agent>(url)
const fetchStrategies = (url: string) => apiFetch<AgentStrategy[]>(url)

function StatusBadge({ status }: { status: Agent['status'] }) {
  const styles = {
    active:      'bg-green-100 text-green-700',
    registering: 'bg-yellow-100 text-yellow-700',
    paused:      'bg-stone-100 text-stone-500',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-stone-50 rounded-lg p-2 text-center">
      <p className="text-base font-bold">{value}</p>
      <p className="text-[10px] text-stone-400 mt-0.5">{label}</p>
    </div>
  )
}

function AgentCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-4 w-32 bg-stone-200 rounded" />
          <div className="h-3 w-24 bg-stone-100 rounded" />
        </div>
        <div className="h-5 w-16 bg-stone-100 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-stone-50 rounded-lg p-2 space-y-1">
            <div className="h-4 w-8 bg-stone-200 rounded mx-auto" />
            <div className="h-2.5 w-12 bg-stone-100 rounded mx-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

function StrategySkeleton() {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-stone-100 flex items-center justify-between animate-pulse">
      <div className="space-y-1.5">
        <div className="h-3.5 w-36 bg-stone-200 rounded" />
        <div className="h-2.5 w-24 bg-stone-100 rounded" />
      </div>
      <div className="h-5 w-12 bg-stone-100 rounded-full" />
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-red-50 rounded-xl p-4 text-center space-y-2 border border-red-100">
      <p className="text-sm text-red-600">{message}</p>
      <button
        onClick={onRetry}
        className="text-xs font-semibold text-red-700 underline"
      >
        Retry
      </button>
    </div>
  )
}

export default function DashboardPage() {
  const agentId = useLocalStorageValue('hbc_agentId')

  const {
    data: agent,
    error: agentError,
    mutate: mutateAgent,
    isLoading: agentLoading,
  } = useSWR<Agent>(
    agentId ? `/api/agents/${agentId}` : null,
    fetchAgent,
    {
      fallbackData: USE_MOCK ? MOCK_AGENT : undefined,
      refreshInterval: (data) =>
        !data || data.status === 'registering' ? 3000 : 30000,
    }
  )

  const {
    data: strategies,
    error: strategiesError,
    mutate: mutateStrategies,
    isLoading: strategiesLoading,
  } = useSWR<AgentStrategy[]>(
    agentId ? `/api/agents/${agentId}/strategies` : null,
    fetchStrategies,
    {
      fallbackData: USE_MOCK ? MOCK_STRATEGIES : undefined,
      refreshInterval: 30000,
    }
  )

  if (!agentId && !USE_MOCK) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 gap-4 text-center">
        <p className="text-stone-400 text-sm">No agent registered yet.</p>
        <Link href="/agent/setup" className="px-6 py-3 bg-black text-white rounded-2xl font-bold text-sm">
          Set Up Agent
        </Link>
      </div>
    )
  }

  const displayAgent = agent ?? MOCK_AGENT

  return (
    <div className="min-h-screen px-5 pt-8 pb-4 space-y-4">
      <h1 className="text-xl font-bold">Dashboard</h1>

      {agentError ? (
        <ErrorState message="Could not load agent data." onRetry={() => mutateAgent()} />
      ) : agentLoading && !agent ? (
        <AgentCardSkeleton />
      ) : (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-base">
                {displayAgent.ensName ?? displayAgent.walletAddress.slice(0, 8) + '...'}
              </p>
              <p className="text-xs text-stone-400 font-mono">
                {displayAgent.walletAddress.slice(0, 10)}...{displayAgent.walletAddress.slice(-6)}
              </p>
            </div>
            <StatusBadge status={displayAgent.status} />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <Stat label="Trades"    value={displayAgent.usageCount} />
            <Stat label="Free left" value={displayAgent.freeTrialRemaining} />
            <Stat label="Daily cap" value={`$${(parseInt(displayAgent.spendLimits.dailyCap) / 1e6).toFixed(0)}`} />
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-sm text-stone-500 uppercase tracking-wide">Strategies</h2>
          <Link href="/agent/strategies" className="text-xs text-black font-medium">+ Add</Link>
        </div>

        {strategiesError ? (
          <ErrorState message="Could not load strategies." onRetry={() => mutateStrategies()} />
        ) : strategiesLoading && !strategies ? (
          <div className="space-y-2">
            <StrategySkeleton />
            <StrategySkeleton />
          </div>
        ) : strategies && strategies.length > 0 ? (
          <div className="space-y-2">
            {strategies.map(s => (
              <div key={s.id} className="bg-white rounded-xl p-3 shadow-sm border border-stone-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-stone-400">{s.interval} · auto-execute: {s.autoExecute ? 'on' : 'off'}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl p-4 text-center text-stone-400 text-sm border border-stone-100">
            No strategies yet — add one to get started.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2">
        <Link href="/agent/proposals" className="bg-black text-white rounded-xl p-3 text-center text-sm font-semibold">
          View Proposals
        </Link>
        <Link href="/agent/history" className="bg-stone-100 text-stone-700 rounded-xl p-3 text-center text-sm font-semibold">
          History
        </Link>
      </div>
    </div>
  )
}
