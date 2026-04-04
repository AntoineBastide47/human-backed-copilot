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
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 space-y-3 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <div className="h-5 w-16 bg-stone-200 rounded-full" />
          <div className="h-3 w-20 bg-stone-100 rounded" />
        </div>
        <div className="h-5 w-14 bg-stone-100 rounded-full" />
      </div>
      <div className="h-5 w-40 bg-stone-200 rounded" />
      <div className="h-3 w-full bg-stone-100 rounded" />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="h-10 bg-stone-100 rounded-xl" />
        <div className="h-10 bg-stone-200 rounded-xl" />
      </div>
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
    {
      refreshInterval: 4000,
    }
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
    if (!agentId) {
      addToast('No active agent found.', false)
      return
    }

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
    if (!agentId) {
      addToast('No active agent found.', false)
      return
    }

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
      <div className="min-h-screen px-5 pt-8 pb-4">
        <div className="space-y-3 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-bold">Proposals</h1>
          <p className="text-sm text-stone-500">
            Recovering your live agent so pending approvals can stream in.
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
            Register an agent and create a strategy to start receiving live proposals.
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
    <div className="min-h-screen px-5 pt-8 pb-4 space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">Proposals</h1>
        {pendingCount > 0 && (
          <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
            {pendingCount}
          </span>
        )}
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <p className="text-red-500 text-sm">Could not load proposals.</p>
          <button
            onClick={() => mutate()}
            className="px-4 py-2 bg-black text-white rounded-xl text-sm font-semibold"
          >
            Retry
          </button>
        </div>
      ) : isLoading && !proposals ? (
        <div className="space-y-3">
          <ProposalCardSkeleton />
          <ProposalCardSkeleton />
        </div>
      ) : !proposals || proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <p className="text-stone-400 text-sm">No pending proposals.</p>
          <p className="text-stone-300 text-xs">
            Live polling is on. New proposals appear here automatically without refreshing.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
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

      <div className="fixed bottom-16 left-4 right-4 space-y-2 pointer-events-none z-50">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`w-full py-3 px-4 rounded-xl text-sm font-medium text-white shadow-lg ${
              t.ok ? 'bg-green-500' : 'bg-stone-700'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
