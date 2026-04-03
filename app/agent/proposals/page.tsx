'use client'
import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { USE_MOCK, MOCK_PROPOSALS, MOCK_AGENT, apiFetch } from '@/lib/mock-data'
import { TOKEN_MAP, txExplorerUrl } from '@/lib/constants'
import type { Proposal } from '@/types'

const fetcher = (url: string) => apiFetch<Proposal[]>(url)

function tokenLabel(address: string) {
  return TOKEN_MAP[address]?.symbol ?? address.slice(0, 6) + '...'
}

function ProposalCard({
  proposal,
  onApprove,
  onReject,
  approvingId,
  rejectingId,
}: {
  proposal: Proposal & { txHash?: string }
  onApprove: (id: string) => void
  onReject: (id: string) => void
  approvingId: string | null
  rejectingId: string | null
}) {
  const isApproving = approvingId === proposal.id
  const isRejecting = rejectingId === proposal.id
  const busy = isApproving || isRejecting

  const inDecimals = proposal.tokenIn === '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1' ? 6 : 18
  const outDecimals = proposal.tokenOut === '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1' ? 6 : 18
  const amountIn = (Number(BigInt(proposal.amount)) / 10 ** inDecimals).toFixed(4)
  const amountOut = (Number(BigInt(proposal.estimatedOutput)) / 10 ** outDecimals).toFixed(2)

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
            proposal.type === 'dca_buy' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
          }`}>
            {proposal.type === 'dca_buy' ? 'DCA Buy' : 'Rebalance'}
          </span>
          <p className="mt-1 text-xs text-stone-400">
            {formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true })}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          proposal.status === 'pending'  ? 'bg-yellow-100 text-yellow-700' :
          proposal.status === 'executed' ? 'bg-green-100 text-green-700'  :
          proposal.status === 'rejected' ? 'bg-stone-100 text-stone-500'  :
          'bg-blue-100 text-blue-700'
        }`}>
          {proposal.status}
        </span>
      </div>

      <div className="flex items-center gap-2 text-base font-semibold">
        <span>{amountIn} {tokenLabel(proposal.tokenIn)}</span>
        <span className="text-stone-300">→</span>
        <span className="text-stone-500">~{amountOut} {tokenLabel(proposal.tokenOut)}</span>
      </div>

      <p className="text-xs text-stone-500 italic">{proposal.reasoning}</p>

      {proposal.txHash && (
        <a
          href={txExplorerUrl(proposal.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-blue-600 underline truncate"
        >
          Tx: {proposal.txHash.slice(0, 20)}...
        </a>
      )}

      {proposal.status === 'pending' && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => onReject(proposal.id)}
            disabled={busy}
            className="py-3 rounded-xl border border-stone-200 text-stone-600 text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
          >
            {isRejecting ? 'Rejecting...' : 'Reject'}
          </button>
          <button
            onClick={() => onApprove(proposal.id)}
            disabled={busy}
            className="py-3 rounded-xl bg-black text-white text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
          >
            {isApproving ? 'Executing...' : 'Approve'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function ProposalsPage() {
  const [agentId, setAgentId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<{ id: string; msg: string; ok: boolean }[]>([])

  useEffect(() => {
    setAgentId(localStorage.getItem('hbc_agentId'))
  }, [])

  const { data: proposals, mutate } = useSWR<(Proposal & { txHash?: string })[]>(
    agentId ? `/api/agents/${agentId}/proposals?status=pending` : null,
    fetcher,
    {
      fallbackData: USE_MOCK ? (MOCK_PROPOSALS as any[]) : undefined,
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

      {!proposals || proposals.length === 0 ? (
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
