'use client'
import { formatDistanceToNow } from 'date-fns'
import { txExplorerUrl } from '@/lib/constants'
import { formatTokenAmount, tokenSymbol } from '@/components/sync4-client'
import type { Proposal } from '@/types'

export interface ProposalCardProps {
  proposal: Proposal & { txHash?: string; tokenInBalance?: string; tokenOutBalance?: string }
  onApprove: (id: string) => void
  onReject: (id: string) => void
  approvingId: string | null
  rejectingId: string | null
}

function formatUsdcDisplay(raw: string): string {
  const value = BigInt(raw)
  const whole = value / BigInt(1_000_000)
  const fraction = (value % BigInt(1_000_000)).toString().padStart(6, '0').slice(0, 2)
  if (fraction === '00') return `$${whole.toString()}`
  return `$${whole.toString()}.${fraction}`
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
  const balanceIn = proposal.tokenInBalance
    ? formatTokenAmount(proposal.tokenInBalance, proposal.tokenIn, 4)
    : null
  const balanceOut = proposal.tokenOutBalance
    ? formatTokenAmount(proposal.tokenOutBalance, proposal.tokenOut, 2)
    : null

  const typeIcon = proposal.type === 'dca_buy' ? 'show_chart' : 'balance'

  const snapshot = proposal.marketSnapshot as {
    currentAllocationBps?: number
    targetAllocationBps?: number
    driftBps?: number
    quotedAt?: string
  } | null

  return (
    <div className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(38,52,61,0.04)] outline outline-1 outline-outline-variant/10 relative overflow-hidden">
      {/* Status badge */}
      <div className="absolute top-0 right-0 p-4">
        <span
          data-testid="proposal-status-badge"
          className={`text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded border ${
            proposal.status === 'pending'
              ? 'bg-secondary-container/50 text-secondary border-secondary-fixed-dim/30'
              : proposal.status === 'executed'
              ? 'bg-tertiary-container/50 text-on-tertiary-container border-tertiary-fixed-dim/30'
              : 'bg-surface-container text-on-surface-variant border-outline-variant/20'
          }`}
        >
          {proposal.status}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pr-20">
        <span className="material-symbols-outlined text-secondary">{typeIcon}</span>
        <div>
          <span
            data-testid="proposal-type-badge"
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              proposal.type === 'dca_buy'
                ? 'bg-secondary-container text-on-secondary-container'
                : 'bg-tertiary-container text-on-tertiary-container'
            }`}
          >
            {proposal.type === 'dca_buy' ? 'DCA Buy' : 'Rebalance'}
          </span>
          <p className="text-[10px] text-on-surface-variant mt-0.5">
            {formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>

      {/* Trigger Summary */}
      {proposal.triggerSummary && (
        <div data-testid="trigger-summary" className="mb-4 px-3 py-2 bg-secondary-container/30 rounded-lg">
          <p className="text-xs font-semibold text-secondary flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">bolt</span>
            {proposal.triggerSummary}
          </p>
        </div>
      )}

      {/* Allocation Drift (rebalance only) */}
      {snapshot?.currentAllocationBps != null && snapshot?.targetAllocationBps != null && (
        <div data-testid="allocation-drift" className="mb-4 grid grid-cols-3 gap-2 text-center">
          <div className="bg-surface-container-low rounded-lg p-2">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Current</p>
            <p className="text-sm font-extrabold text-on-surface">{(snapshot.currentAllocationBps / 100).toFixed(1)}%</p>
          </div>
          <div className="bg-surface-container-low rounded-lg p-2">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Target</p>
            <p className="text-sm font-extrabold text-on-surface">{(snapshot.targetAllocationBps / 100).toFixed(1)}%</p>
          </div>
          <div className="bg-surface-container-low rounded-lg p-2">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Drift</p>
            <p className={`text-sm font-extrabold ${
              snapshot.driftBps != null && Math.abs(snapshot.driftBps) > 500
                ? 'text-error'
                : 'text-on-surface'
            }`}>
              {snapshot.driftBps != null ? `${snapshot.driftBps > 0 ? '+' : ''}${(snapshot.driftBps / 100).toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Amounts */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-surface-container-low rounded-lg p-3">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Selling</p>
          <p data-testid="amount-in" className="text-base font-extrabold text-on-surface">
            {amountIn} {tokenSymbol(proposal.tokenIn)}
          </p>
          {balanceIn && (
            <p data-testid="token-in-balance" className="mt-1 text-[11px] font-medium text-on-surface-variant">
              Balance {balanceIn} {tokenSymbol(proposal.tokenIn)}
            </p>
          )}
        </div>
        <div className="bg-surface-container-low rounded-lg p-3">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Est. Receive</p>
          <p data-testid="amount-out" className="text-base font-extrabold text-on-surface">
            ~{amountOut} {tokenSymbol(proposal.tokenOut)}
          </p>
          {balanceOut && (
            <p data-testid="token-out-balance" className="mt-1 text-[11px] font-medium text-on-surface-variant">
              Balance {balanceOut} {tokenSymbol(proposal.tokenOut)}
            </p>
          )}
        </div>
      </div>

      {/* Notional USD */}
      {proposal.notionalUsd && (
        <div data-testid="notional-usd" className="mb-4 flex items-center gap-2">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Notional:</span>
          <span className="text-sm font-bold text-on-surface">{formatUsdcDisplay(proposal.notionalUsd)}</span>
        </div>
      )}

      {/* Reasoning */}
      <div className="mb-5 p-4 bg-surface-container-low/50 rounded-lg border-l-4 border-secondary/30">
        <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-1 flex items-center gap-1">
          <span className="material-symbols-outlined text-xs">verified</span>
          Agent Reasoning
        </p>
        <p className="text-sm text-on-surface-variant leading-relaxed italic">
          {proposal.reasoning}
        </p>
      </div>

      {/* Quote timestamp */}
      {snapshot?.quotedAt && (
        <p data-testid="quote-timestamp" className="text-[10px] text-on-surface-variant/60 mb-3">
          Quote: {formatDistanceToNow(new Date(snapshot.quotedAt), { addSuffix: true })}
        </p>
      )}

      {/* Tx link */}
      {proposal.txHash && (
        <a
          data-testid="tx-link"
          href={txExplorerUrl(proposal.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-secondary-dim mb-4 font-mono"
        >
          {proposal.txHash.slice(0, 20)}...
          <span className="material-symbols-outlined text-xs">open_in_new</span>
        </a>
      )}

      {/* Actions */}
      {proposal.status === 'pending' && (
        <div className="flex flex-col gap-3">
          <button
            data-testid="approve-button"
            onClick={() => onApprove(proposal.id)}
            disabled={busy}
            className="w-full py-4 bg-[#162238] text-white rounded-xl font-bold text-sm tracking-wide shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isApproving ? 'Executing...' : 'Approve'}
          </button>
          <button
            data-testid="reject-button"
            onClick={() => onReject(proposal.id)}
            disabled={busy}
            className="w-full py-4 bg-transparent text-on-surface-variant outline outline-1 outline-outline-variant/30 rounded-xl font-bold text-sm tracking-wide active:scale-95 transition-transform disabled:opacity-50"
          >
            {isRejecting ? 'Rejecting...' : 'Reject Proposal'}
          </button>
        </div>
      )}
    </div>
  )
}
