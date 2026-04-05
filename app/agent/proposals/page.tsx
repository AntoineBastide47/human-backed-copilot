'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { MiniKit } from '@worldcoin/minikit-js'
import {
  fetchJson,
  isApiError,
  normalizeProposalList,
  removeProposalFromList,
  type ProposalRecord,
} from '@/components/sync4-client'
import { useAgentId } from '@/components/use-agent-id'
import { ProposalCard } from '@/components/proposal-card'
import { WORLD_CHAIN_ID } from '@/lib/constants'

const fetcher = async (url: string) => normalizeProposalList(await fetchJson<unknown>(url))
const CONFIRM_POLL_INTERVAL_MS = 2_000
const CONFIRM_MAX_ATTEMPTS = 10

interface PreparedApproval {
  success: true
  transactions: Array<{ to: string; data: string; value?: string }>
  amountIn: string
  amountOut: string
  approvalNeeded: boolean
  debug?: {
    walletAddress: string
    transactionTargets: string[]
    tokenIn: string
    spender: string | null
    currentAllowance: string | null
  }
}

interface ConfirmedApproval {
  success: true
  txHash: string
}

interface PendingApproval {
  success: false
  pending: true
}

function formatInvalidContractMessage(transactions: PreparedApproval['transactions'] | undefined) {
  const uniqueAddresses = (transactions ?? []).reduce<string[]>((list, tx) => {
    const address = tx.to
    if (!list.some((entry) => entry.toLowerCase() === address.toLowerCase())) {
      list.push(address)
    }
    return list
  }, [])

  if (uniqueAddresses.length === 0) {
    return 'World App blocked a contract in this trade. Whitelist the token contract and Uniswap router in the Developer Portal.'
  }

  return [
    'World App blocked a contract in this trade.',
    'Whitelist these Contract Entrypoints:',
    ...uniqueAddresses,
  ].join('\n')
}

function formatSimulationFailedMessage(preparedApproval: PreparedApproval | null) {
  const walletAddress = preparedApproval?.debug?.walletAddress
  const targets = preparedApproval?.debug?.transactionTargets ?? []
  const tokenIn = preparedApproval?.debug?.tokenIn
  const spender = preparedApproval?.debug?.spender
  const currentAllowance = preparedApproval?.debug?.currentAllowance

  const lines = [
    'World App simulation failed.',
    walletAddress ? `Prep wallet: ${walletAddress}` : null,
    tokenIn ? `Token in: ${tokenIn}` : null,
    spender ? `Spender: ${spender}` : null,
    currentAllowance !== undefined && currentAllowance !== null ? `Permit2 allowance: ${currentAllowance}` : null,
    targets.length > 0 ? 'Transaction targets:' : null,
    ...targets,
    'Check that this exact wallet holds the input token and is the sender World App is simulating.',
  ].filter(Boolean)

  return lines.join('\n')
}

async function sendWorldTransaction(preparedApproval: PreparedApproval) {
  return MiniKit.sendTransaction({
    chainId: WORLD_CHAIN_ID,
    transactions: preparedApproval.transactions,
  })
}

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

  const addToast = (msg: string, ok: boolean, durationMs?: number) => {
    const id = globalThis.crypto?.randomUUID?.() ?? `toast-${Date.now()}-${Math.random()}`
    setToasts(t => [...t, { id, msg, ok }])
    const lifetime = durationMs ?? (msg.length > 120 ? 10_000 : 5_000)
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), lifetime)
  }

  const rollbackApproval = async (proposalId: string) => {
    if (!agentId) return

    try {
      await fetchJson<{ cancelled: true }>(
        `/api/agents/${agentId}/approve/cancel`,
        { method: 'POST', body: JSON.stringify({ proposalId }) }
      )
    } catch {
      // Ignore rollback failures and rely on the next refresh to rehydrate.
    }
  }

  const waitForConfirmation = async (proposalId: string, userOpHash: string) => {
    if (!agentId) return null

    for (let attempt = 0; attempt < CONFIRM_MAX_ATTEMPTS; attempt += 1) {
      const confirmation = await fetchJson<ConfirmedApproval | PendingApproval>(
        `/api/agents/${agentId}/approve/confirm`,
        {
          method: 'POST',
          body: JSON.stringify({ proposalId, userOpHash }),
        }
      )

      if (confirmation.success) {
        return confirmation
      }

      await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_INTERVAL_MS))
    }

    return null
  }

  const handleApprove = async (proposalId: string) => {
    if (!agentId) { addToast('No active agent found.', false); return }
    if (!MiniKit.isInstalled()) { addToast('Open this mini app in World App to approve trades.', false); return }
    setApprovingId(proposalId)
    let preparedApproval: PreparedApproval | null = null
    let prepared = false
    let submitted = false
    try {
      const proposal = proposals?.find((item) => item.id === proposalId)
      preparedApproval = await fetchJson<PreparedApproval>(
        `/api/agents/${agentId}/approve`,
        { method: 'POST', body: JSON.stringify({ proposalId }) }
      )
      prepared = true

      const result = await sendWorldTransaction(preparedApproval)
      submitted = true

      if (proposal) {
        await mutate(removeProposalFromList(proposals, proposalId), { revalidate: false })
      } else {
        await mutate()
      }

      const confirmation = await waitForConfirmation(proposalId, result.data.userOpHash)
      if (confirmation?.success) {
        addToast('Trade confirmed on World Chain.', true)
        void mutate()
        if (historyKey) void mutateCache(historyKey)
      } else {
        addToast('Trade submitted. Waiting for World Chain confirmation.', true)
      }
    } catch (err) {
      if (prepared && !submitted) {
        await rollbackApproval(proposalId)
      }
      void mutate()
      const message = err instanceof Error ? err.message : 'Error approving'
      if (message.includes('user_rejected')) {
        addToast('Transaction cancelled in World App.', false)
      } else if (message.includes('invalid_contract')) {
        addToast(formatInvalidContractMessage(preparedApproval?.transactions), false, 12_000)
      } else if (message.includes('simulation_failed')) {
        addToast(formatSimulationFailedMessage(preparedApproval), false, 12_000)
      } else {
        addToast(message, false)
      }
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
      <div className="fixed bottom-36 left-4 right-4 space-y-2 pointer-events-none z-50 max-h-[40vh] overflow-y-auto">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`w-full py-3 px-4 rounded-xl text-sm font-medium text-white shadow-lg whitespace-pre-wrap break-all leading-relaxed text-left ${
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
