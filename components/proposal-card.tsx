'use client'
import { formatDistanceToNow } from 'date-fns'
import { txExplorerUrl } from '@/lib/constants'
import { formatTokenAmount, tokenSymbol } from '@/components/sync4-client'
import type { Proposal } from '@/types'

export interface ProposalCardProps {
  proposal: Proposal & { txHash?: string }
  onApprove: (id: string) => void
  onReject: (id: string) => void
  approvingId: string | null
  rejectingId: string | null
}

export function ProposalCard({
  proposal,
  onApprove,
  onReject,
  approvingId,
  rejectingId,
}: ProposalCardProps) {
  const isApproving = approvingId === proposal.id
  const isRejecting = rejectingId === proposal.id
  const busy = isApproving || isRejecting

  const amountIn = formatTokenAmount(proposal.amount, proposal.tokenIn, 4)
  const amountOut = formatTokenAmount(proposal.estimatedOutput, proposal.tokenOut, 2)

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <span
            data-testid="proposal-type-badge"
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
              proposal.type === 'dca_buy' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
            }`}
          >
            {proposal.type === 'dca_buy' ? 'DCA Buy' : 'Rebalance'}
          </span>
          <p className="mt-1 text-xs text-stone-400">
            {formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true })}
          </p>
        </div>
        <span
          data-testid="proposal-status-badge"
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            proposal.status === 'pending'  ? 'bg-yellow-100 text-yellow-700' :
            proposal.status === 'executed' ? 'bg-green-100 text-green-700'  :
            proposal.status === 'rejected' ? 'bg-stone-100 text-stone-500'  :
            'bg-blue-100 text-blue-700'
          }`}
        >
          {proposal.status}
        </span>
      </div>

      <div className="flex items-center gap-2 text-base font-semibold">
        <span data-testid="amount-in">{amountIn} {tokenSymbol(proposal.tokenIn)}</span>
        <span className="text-stone-300">→</span>
        <span data-testid="amount-out" className="text-stone-500">~{amountOut} {tokenSymbol(proposal.tokenOut)}</span>
      </div>

      <p className="text-xs text-stone-500 italic">{proposal.reasoning}</p>

      {proposal.txHash && (
        <a
          data-testid="tx-link"
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
            data-testid="reject-button"
            onClick={() => onReject(proposal.id)}
            disabled={busy}
            className="py-3 rounded-xl border border-stone-200 text-stone-600 text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
          >
            {isRejecting ? 'Rejecting...' : 'Reject'}
          </button>
          <button
            data-testid="approve-button"
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
