'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { USE_MOCK, MOCK_AGENT, MOCK_STRATEGIES, apiFetch } from '@/lib/mock-data'
import type { Agent, AgentStrategy } from '@/types'

const fetcher = (url: string) => apiFetch<any>(url)

function StatusBadge({ status }: { status: Agent['status'] }) {
  const styles = {
    active: 'bg-green-100 text-green-700',
    registering: 'bg-yellow-100 text-yellow-700',
    paused: 'bg-stone-100 text-stone-500',
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

export default function DashboardPage() {
  const [agentId, setAgentId] = useState<string | null>(null)

  useEffect(() => {
    setAgentId(localStorage.getItem('hbc_agentId'))
  }, [])

  const { data: agent } = useSWR<Agent>(
    agentId ? `/api/agents/${agentId}` : null,
    fetcher,
    {
      fallbackData: USE_MOCK ? MOCK_AGENT : undefined,
      // Poll fast while registering, slow once active
      refreshInterval: (data) =>
        !data || data.status === 'registering' ? 3000 : 30000,
    }
  )

  const { data: strategies } = useSWR<AgentStrategy[]>(
    agentId ? `/api/agents/${agentId}/strategies` : null,
    fetcher,
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
          <Stat label="Trades" value={displayAgent.usageCount} />
          <Stat label="Free left" value={displayAgent.freeTrialRemaining} />
          <Stat label="Daily cap" value={`$${(parseInt(displayAgent.spendLimits.dailyCap) / 1e6).toFixed(0)}`} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-sm text-stone-500 uppercase tracking-wide">Strategies</h2>
          <Link href="/agent/strategies" className="text-xs text-black font-medium">+ Add</Link>
        </div>
        {strategies && strategies.length > 0 ? (
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
