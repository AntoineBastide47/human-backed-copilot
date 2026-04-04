'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  fetchJson,
  isApiError,
  normalizeProposalList,
} from '@/components/sync4-client'
import { useAgentId } from '@/components/use-agent-id'
import type { Agent, AgentStrategy } from '@/types'

const fetcher = <T,>(url: string) => fetchJson<T>(url)
const proposalsFetcher = async (url: string) =>
  normalizeProposalList(await fetchJson<unknown>(url))

function AgentCardSkeleton() {
  return (
    <div className="bg-secondary rounded-xl p-6 animate-pulse">
      <div className="h-3 w-24 bg-white/20 rounded mb-3" />
      <div className="h-8 w-40 bg-white/20 rounded mb-4" />
      <div className="h-3 w-32 bg-white/10 rounded" />
    </div>
  )
}

function StrategySkeleton() {
  return (
    <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/5 animate-pulse flex items-center gap-4">
      <div className="w-12 h-12 rounded-lg bg-surface-container" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-36 bg-surface-container rounded" />
        <div className="h-3 w-24 bg-surface-container-high rounded" />
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-5 border border-error/10 space-y-2">
      <p className="text-sm text-error">{message}</p>
      <button onClick={onRetry} className="text-xs font-semibold text-error underline">
        Retry
      </button>
    </div>
  )
}

export default function DashboardPage() {
  const { agentId, hydrated, isResolving, setAgentId } = useAgentId()

  const {
    data: agent,
    error: agentError,
    mutate: mutateAgent,
    isLoading: agentLoading,
  } = useSWR<Agent>(
    agentId ? `/api/agents/${agentId}` : null,
    fetcher<Agent>,
    {
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
    fetcher<AgentStrategy[]>,
    { refreshInterval: 30000 }
  )

  const { data: pendingProposals } = useSWR(
    agentId ? `/api/agents/${agentId}/proposals?status=pending` : null,
    proposalsFetcher,
    { refreshInterval: 5000 }
  )

  const pendingCount = pendingProposals?.length ?? 0

  useEffect(() => {
    if (isApiError(agentError) && agentError.status === 404) {
      setAgentId(null)
    }
  }, [agentError, setAgentId])

  if (!agentId && isResolving) {
    return (
      <div className="px-4 mt-4">
        <div className="bg-secondary rounded-xl p-6 animate-pulse">
          <div className="h-3 w-24 bg-white/20 rounded mb-3" />
          <div className="h-8 w-40 bg-white/20 rounded mb-4" />
        </div>
      </div>
    )
  }

  if (!agentId && hydrated) {
    return (
      <div className="px-4 mt-4 flex flex-col items-center justify-center gap-4 text-center py-16">
        <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center">
          <span className="material-symbols-outlined text-on-surface-variant text-3xl">smart_toy</span>
        </div>
        <p className="text-on-surface-variant text-sm">No agent registered yet.</p>
        <Link href="/agent/setup" className="px-6 py-3 bg-[#162238] text-white rounded-xl font-bold text-sm">
          Set Up Agent
        </Link>
      </div>
    )
  }

  const agentDisplay = agent?.ensName
    ?? (agent?.walletAddress
      ? `${agent.walletAddress.slice(0, 8)}...`
      : '...')

  const dailyCapRaw = agent?.spendLimits?.dailyCap
  const dailyCapDisplay = dailyCapRaw
    ? `$${(parseInt(dailyCapRaw) / 1e6).toFixed(0)}`
    : '—'

  const statusColors: Record<Agent['status'], string> = {
    active:      'bg-tertiary-container text-on-tertiary-container',
    registering: 'bg-secondary-container text-on-secondary-container',
    paused:      'bg-surface-container-high text-on-surface-variant',
  }

  return (
    <div className="px-4 space-y-6 mt-4">

      {/* Status banners */}
      {agent?.status === 'registering' && (
        <div
          data-testid="registering-notice"
          className="flex items-center gap-3 px-4 py-3 bg-secondary-container rounded-xl border border-secondary-fixed-dim/30"
        >
          <span className="material-symbols-outlined text-secondary text-lg">hourglass_top</span>
          <p className="text-sm text-on-secondary-container">
            Your agent is registering on-chain. This usually takes under a minute.
          </p>
        </div>
      )}

      {agent?.status === 'paused' && (
        <div
          data-testid="paused-notice"
          className="flex items-center gap-3 px-4 py-3 bg-surface-container rounded-xl border border-outline-variant/20"
        >
          <span className="material-symbols-outlined text-on-surface-variant text-lg">pause_circle</span>
          <p className="text-sm text-on-surface-variant">
            Your agent is paused. No new proposals will be generated until you resume it.
          </p>
        </div>
      )}

      {agent && agent.freeTrialRemaining === 0 && agent.status === 'active' && (
        <div
          data-testid="trial-exhausted-notice"
          className="flex items-center gap-3 px-4 py-3 bg-error-container/20 rounded-xl border border-error/20"
        >
          <span className="material-symbols-outlined text-error text-lg">credit_card_off</span>
          <p className="text-sm text-error">
            Free trial exhausted. Connect a payment method to keep executing trades.
          </p>
        </div>
      )}

      {/* Portfolio hero card */}
      <section>
        {agentError ? (
          <ErrorState message="Could not load agent data." onRetry={() => mutateAgent()} />
        ) : agentLoading && !agent ? (
          <AgentCardSkeleton />
        ) : agent ? (
          <div className="bg-surface-container-lowest rounded-xl px-5 py-4 border border-outline-variant/10 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">Active Agent</p>
              <h2 className="text-base font-bold text-on-surface">{agentDisplay}</h2>
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[agent.status]}`}>
                {agent.status}
              </span>
            </div>
            <button
              onClick={() => {
                if (confirm('Delete this agent?')) {
                  fetchJson(`/api/agents/${agentId}`, { method: 'DELETE' }).catch(() => {})
                  setAgentId(null)
                }
              }}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
              aria-label="Delete agent"
            >
              <span className="material-symbols-outlined text-xl">delete</span>
            </button>
          </div>
        ) : (
          <ErrorState message="Agent not available yet." onRetry={() => mutateAgent()} />
        )}
      </section>

      {/* Stats row */}
      {agent && (
        <section className="grid grid-cols-3 gap-3">
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/10">
            <p className="text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider font-bold">Trades</p>
            <div className="text-xl font-bold text-on-surface">{agent.usageCount}</div>
            <div className="w-full bg-surface-container h-1 rounded-full mt-2 overflow-hidden">
              <div className="bg-primary h-full w-2/3" />
            </div>
          </div>
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/10">
            <p className="text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider font-bold">Daily Cap</p>
            <div className="text-base font-bold text-on-surface">{dailyCapDisplay}</div>
            <div className="w-full bg-surface-container h-1 rounded-full mt-2 overflow-hidden">
              <div className="bg-tertiary h-full w-3/4" />
            </div>
          </div>
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/10">
            <p className="text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider font-bold">Free left</p>
            <div className={`text-xl font-bold ${
              agent.freeTrialRemaining === 0 ? 'text-error' :
              agent.freeTrialRemaining === 1 ? 'text-tertiary' :
              'text-on-surface'
            }`}>{agent.freeTrialRemaining}</div>
          </div>
        </section>
      )}

      {/* Active Strategies */}
      <section className="space-y-4">
        <div className="flex justify-between items-end px-1">
          <h3 className="font-bold text-on-surface">Active Strategies</h3>
          <Link href="/agent/strategies" className="text-primary text-xs font-bold uppercase tracking-widest">
            + Add
          </Link>
        </div>

        {strategiesError ? (
          <ErrorState message="Could not load strategies." onRetry={() => mutateStrategies()} />
        ) : strategiesLoading && !strategies ? (
          <div className="space-y-3">
            <StrategySkeleton />
            <StrategySkeleton />
          </div>
        ) : strategies && strategies.length > 0 ? (
          <div className="space-y-3">
            {strategies.map(s => (
              <div
                key={s.id}
                className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/5 shadow-sm flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-secondary">rocket_launch</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-on-surface text-sm">{s.name}</h4>
                    <p className="text-xs text-on-surface-variant font-medium">
                      {s.interval} · auto-execute: {s.autoExecute ? 'on' : 'off'}
                    </p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  s.status === 'active' ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-surface-container text-on-surface-variant'
                }`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-surface-container-lowest rounded-xl p-5 text-center border border-outline-variant/10">
            <p className="text-sm text-on-surface-variant">
              No strategies yet —{' '}
              <Link href="/agent/strategies" className="text-secondary font-semibold underline">
                add one
              </Link>{' '}
              to get started.
            </p>
          </div>
        )}
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-2 gap-3">
        <Link
          href="/agent/proposals"
          className="relative bg-[#162238] text-white rounded-xl p-4 text-center text-sm font-bold shadow-sm"
        >
          View Proposals
          {pendingCount > 0 && (
            <span
              data-testid="proposals-link-badge"
              className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-error text-white text-xs font-bold rounded-full flex items-center justify-center"
            >
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </Link>
        <Link
          href="/agent/history"
          className="bg-surface-container-low text-on-surface-variant rounded-xl p-4 text-center text-sm font-bold"
        >
          History
        </Link>
      </section>

    </div>
  )
}
