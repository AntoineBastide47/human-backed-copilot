'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import {
  fetchJson,
  isApiError,
  normalizeProposalList,
  prependExecutionToPage,
  removeProposalFromList,
  type ProposalRecord,
} from '@/components/sync4-client'
import { useAgentId } from '@/components/use-agent-id'
import { ProposalCard } from '@/components/proposal-card'

const fetcher = async (url: string) => normalizeProposalList(await fetchJson<unknown>(url))

function ProposalCardSkeleton() {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-6 outline outline-1 outline-outline-variant/10 space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-surface-container" />
        <div className="space-y-1.5">
          <div className="h-4 w-24 bg-surface-container rounded-full" />
          <div className="h-3 w-16 bg-surface-container-high rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="h-16 bg-surface-container-low rounded-lg" />
        <div className="h-16 bg-surface-container-low rounded-lg" />
      </div>
      <div className="h-20 bg-surface-container-low/50 rounded-lg" />
      <div className="h-12 bg-surface-container rounded-xl" />
      <div className="h-12 bg-surface-container-low rounded-xl" />
    </div>
  )
}

export default function ProposalsPage() {
  const { agentId, hydrated, isResolving, setAgentId } = useAgentId()
  const { mutate: mutateCache } = useSWRConfig()
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<{ id: string; msg: string; ok: boolean }[]>([])

  const proposalsKey = agentId ? `/api/agents/${agentId}/proposals?status=pending` : null
  const historyKey = agentId ? `/api/executions?agentId=${agentId}` : null

  const { data: proposals, error, mutate, isLoading } = useSWR<ProposalRecord[]>(
    proposalsKey,
    fetcher,
    { refreshInterval: 4000 }
  )

  useEffect(() => {
    if (isApiError(error) && error.status === 404) {
      setAgentId(null)
    }
  }, [error, setAgentId])

  const addToast = (msg: string, ok: boolean) => {
    const id = globalThis.crypto?.randomUUID?.() ?? `toast-${Date.now()}-${Math.random()}`
    setToasts(t => [...t, { id, msg, ok }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }

  const handleApprove = async (proposalId: string) => {
    if (!agentId) { addToast('No active agent found.', false); return }
    setApprovingId(proposalId)
    try {
      const proposal = proposals?.find((item) => item.id === proposalId)
      const data = await fetchJson<{ success: boolean; txHash?: string }>(
        `/api/agents/${agentId}/approve`,
        { method: 'POST', body: JSON.stringify({ proposalId }) }
      )
      if (proposal) {
        await mutate(removeProposalFromList(proposals, proposalId), { revalidate: false })
        if (historyKey) {
          await mutateCache(
            historyKey,
            (current: unknown) =>
              prependExecutionToPage(current, {
                id: `optimistic-${proposalId}`,
                agentId,
                strategyId: proposal.strategyId,
                proposalId,
                txHash: data.txHash ?? '',
                amountIn: proposal.amount,
                amountOut: proposal.estimatedOutput,
                status: data.txHash ? 'confirmed' : 'pending',
                executedAt: new Date().toISOString(),
                tokenIn: proposal.tokenIn,
                tokenOut: proposal.tokenOut,
              }),
            { revalidate: false }
          )
        }
      } else {
        await mutate()
      }
      addToast(
        data.txHash ? `Executed on-chain: ${data.txHash.slice(0, 10)}...` : 'Trade executed.',
        true
      )
      void mutate()
      if (historyKey) void mutateCache(historyKey)
    } catch (err) {
      void mutate()
      addToast(err instanceof Error ? err.message : 'Error approving', false)
    } finally {
      setApprovingId(null)
    }
  }

  const handleReject = async (proposalId: string) => {
    if (!agentId) { addToast('No active agent found.', false); return }
    setRejectingId(proposalId)
    try {
      await fetchJson(`/api/agents/${agentId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ proposalId }),
      })
      await mutate(removeProposalFromList(proposals, proposalId), { revalidate: false })
      addToast('Proposal rejected', false)
      void mutate()
    } catch (err) {
      void mutate()
      addToast(err instanceof Error ? err.message : 'Error rejecting', false)
    } finally {
      setRejectingId(null)
    }
  }

  const pendingCount = proposals?.length ?? 0

  if (!agentId && isResolving) {
    return (
      <div className="px-6 mt-4">
        <div className="bg-surface-container-lowest rounded-xl p-6 outline outline-1 outline-outline-variant/10 space-y-3">
          <h1 className="text-2xl font-extrabold text-on-surface">Execution Queue</h1>
          <p className="text-sm text-on-surface-variant">Recovering your live agent so pending approvals can stream in.</p>
        </div>
      </div>
    )
  }

  if (!agentId && hydrated) {
    return (
      <div className="px-4 mt-4">
        <div className="bg-surface-container-lowest rounded-xl p-6 outline outline-1 outline-outline-variant/10 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-on-surface-variant text-2xl">description</span>
          </div>
          <h1 className="text-xl font-bold text-on-surface">No Agent Found</h1>
          <p className="text-sm text-on-surface-variant">
            Register an agent and create a strategy to start receiving live proposals.
          </p>
          <Link href="/agent/setup" className="block bg-[#162238] text-white rounded-xl py-3 text-sm font-bold">
            Register Agent
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 mt-4 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface leading-tight">
            Execution Queue
          </h1>
          <p className="text-on-surface-variant font-medium mt-1">Ready for confirmation</p>
        </div>
        {pendingCount > 0 && (
          <div className="bg-secondary text-white font-bold px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            {pendingCount}
          </div>
        )}
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <p className="text-error text-sm">Could not load proposals.</p>
          <button
            onClick={() => mutate()}
            className="px-4 py-2 bg-[#162238] text-white rounded-xl text-sm font-semibold"
          >
            Retry
          </button>
        </div>
      ) : isLoading && !proposals ? (
        <div className="space-y-6">
          <ProposalCardSkeleton />
          <ProposalCardSkeleton />
        </div>
      ) : !proposals || proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center">
            <span className="material-symbols-outlined text-on-surface-variant text-3xl">inbox</span>
          </div>
          <p className="text-on-surface-variant text-sm font-medium">No pending proposals.</p>
          <p className="text-on-surface-variant/60 text-xs max-w-xs">
            Live polling is on. New proposals appear here automatically without refreshing.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {proposals.map(p => (
            <ProposalCard
              key={p.id}
              proposal={p}
              onApprove={handleApprove}
              onReject={handleReject}
              approvingId={approvingId}
              rejectingId={rejectingId}
            />
          ))}
        </div>
      )}

      {/* Toasts */}
      <div className="fixed bottom-28 left-4 right-4 space-y-2 pointer-events-none z-50">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`w-full py-3 px-4 rounded-xl text-sm font-medium text-white shadow-lg ${
              t.ok ? 'bg-tertiary' : 'bg-secondary-dim'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
