'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { USE_MOCK, MOCK_PROPOSALS, MOCK_AGENT, apiFetch } from '@/lib/mock-data'
import type { Proposal } from '@/types'
import { ProposalCard } from '@/components/proposal-card'
import { useLocalStorageValue } from '@/lib/client-storage'

type ProposalWithTxHash = Proposal & { txHash?: string }

const fetcher = (url: string) => apiFetch<ProposalWithTxHash[]>(url)

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
  const agentId = useLocalStorageValue('hbc_agentId')
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [toasts, setToasts]         = useState<{ id: string; msg: string; ok: boolean }[]>([])

  const { data: proposals, error, mutate, isLoading } = useSWR<ProposalWithTxHash[]>(
    agentId ? `/api/agents/${agentId}/proposals?status=pending` : null,
    fetcher,
    {
      fallbackData: USE_MOCK ? MOCK_PROPOSALS : undefined,
      refreshInterval: 5000,
    }
  )

  const addToast = (msg: string, ok: boolean) => {
    const id = crypto.randomUUID()
    setToasts(t => [...t, { id, msg, ok }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }

  const handleApprove = async (proposalId: string) => {
    setApprovingId(proposalId)
    try {
      const id = agentId ?? (USE_MOCK ? MOCK_AGENT.id : '')
      if (USE_MOCK) {
        await new Promise(r => setTimeout(r, 1200))
        addToast('Swap confirmed (mock)', true)
        mutate()
        return
      }
      const data = await apiFetch<{ success: boolean; txHash?: string; error?: string }>(
        `/api/agents/${id}/approve`,
        { method: 'POST', body: JSON.stringify({ proposalId }) }
      )
      if (data.success) {
        addToast(`Executed! Tx: ${data.txHash?.slice(0, 10)}...`, true)
      } else {
        addToast(data.error ?? 'Approval failed', false)
      }
      mutate()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error approving', false)
    } finally {
      setApprovingId(null)
    }
  }

  const handleReject = async (proposalId: string) => {
    setRejectingId(proposalId)
    try {
      const id = agentId ?? (USE_MOCK ? MOCK_AGENT.id : '')
      if (USE_MOCK) {
        await new Promise(r => setTimeout(r, 400))
        addToast('Proposal rejected', false)
        mutate()
        return
      }
      await apiFetch(`/api/agents/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ proposalId }),
      })
      addToast('Proposal rejected', false)
      mutate()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error rejecting', false)
    } finally {
      setRejectingId(null)
    }
  }

  const pendingCount = proposals?.filter(p => p.status === 'pending').length ?? 0

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
          <p className="text-stone-300 text-xs">Your agent is watching markets — check back soon.</p>
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
