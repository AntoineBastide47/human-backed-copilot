'use client'
import Link from 'next/link'
import { useEffect } from 'react'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { txExplorerUrl } from '@/lib/constants'
import {
  fetchJson,
  formatTokenAmount,
  isApiError,
  normalizeExecutionPage,
  tokenSymbol,
  type ExecutionRecord,
} from '@/components/sync4-client'
import { useAgentId } from '@/components/use-agent-id'
import type { Agent, AgentStrategy, Execution, PaginatedResponse } from '@/types'

// History executions use the strategy's tokenIn/tokenOut when available.
// Fall back to WETH (18 dec) for amountIn and USDC (6 dec) for amountOut
// to match the default DCA strategy direction.
const WETH = '0x4200000000000000000000000000000000000006'
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1'

const executionsFetcher = async (url: string) =>
  normalizeExecutionPage(await fetchJson<unknown>(url))

function StatusBadge({ status }: { status: Execution['status'] }) {
  const styles = {
    confirmed: 'bg-green-100 text-green-700',
    pending:   'bg-yellow-100 text-yellow-700',
    failed:    'bg-red-100 text-red-600',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  )
}

function ExecutionSkeleton() {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-stone-100 space-y-2 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3 w-24 bg-stone-200 rounded" />
        <div className="h-5 w-16 bg-stone-100 rounded-full" />
      </div>
      <div className="h-4 w-40 bg-stone-200 rounded" />
      <div className="flex items-center justify-between">
        <div className="h-3 w-20 bg-stone-100 rounded" />
        <div className="h-3 w-24 bg-stone-100 rounded" />
      </div>
    </div>
  )
}

export default function HistoryPage() {
  const { agentId, hydrated, isResolving, setAgentId } = useAgentId()

  const executionsKey = agentId ? `/api/executions?agentId=${agentId}` : null
  const agentKey = agentId ? `/api/agents/${agentId}` : null
  const strategiesKey = agentId ? `/api/agents/${agentId}/strategies` : null

  const {
    data: executionPage,
    error,
    mutate,
    isLoading,
  } = useSWR<PaginatedResponse<ExecutionRecord>>(
    executionsKey,
    executionsFetcher,
    {
      refreshInterval: 15000,
    }
  )

  const { data: agent } = useSWR<Agent>(agentKey, (url: string) => fetchJson<Agent>(url), {
    refreshInterval: 30000,
  })
  const { data: strategies } = useSWR<AgentStrategy[]>(
    strategiesKey,
    (url: string) => fetchJson<AgentStrategy[]>(url),
    {
      refreshInterval: 30000,
    }
  )

  useEffect(() => {
    if (isApiError(error) && error.status === 404) {
      setAgentId(null)
    }
  }, [error, setAgentId])

  if (!agentId && isResolving) {
    return (
      <div className="min-h-screen px-5 pt-8 pb-4">
        <div className="space-y-3 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-bold">History</h1>
          <p className="text-sm text-stone-500">
            Loading the latest execution history for your live agent.
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
            Approve a live proposal first, then execution history will appear here automatically.
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

  const executions = executionPage?.data ?? []
  const strategyTokensById = Object.fromEntries(
    (strategies ?? []).map((strategy) => [
      strategy.id,
      { tokenIn: strategy.tokenIn, tokenOut: strategy.tokenOut },
    ])
  ) as Record<string, { tokenIn: string; tokenOut: string }>

  const agentDisplay = agent?.ensName
    ?? (agent?.walletAddress
      ? `${agent.walletAddress.slice(0, 10)}...${agent.walletAddress.slice(-4)}`
      : agentId?.slice(0, 10) ?? '...')

  return (
    <div className="min-h-screen px-5 pt-8 pb-4 space-y-4">
      <h1 className="text-xl font-bold">History</h1>

      {error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <p className="text-red-500 text-sm">Could not load history.</p>
          <button
            onClick={() => mutate()}
            className="px-4 py-2 bg-black text-white rounded-xl text-sm font-semibold"
          >
            Retry
          </button>
        </div>
      ) : isLoading && !executionPage ? (
        <div className="space-y-2">
          <ExecutionSkeleton />
          <ExecutionSkeleton />
          <ExecutionSkeleton />
        </div>
      ) : executions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <p className="text-stone-400 text-sm">No executions yet.</p>
          <p className="text-stone-300 text-xs">
            Approve a live proposal and the confirmed transaction will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {executions.map(ex => {
            const strategyTokens = strategyTokensById[ex.strategyId]
            const inAddr = ex.tokenIn ?? strategyTokens?.tokenIn ?? WETH
            const outAddr = ex.tokenOut ?? strategyTokens?.tokenOut ?? USDC
            const amountIn = formatTokenAmount(ex.amountIn, inAddr, 4)
            const amountOut = formatTokenAmount(ex.amountOut, outAddr, 2)

            return (
              <div key={ex.id} className="bg-white rounded-xl p-3 shadow-sm border border-stone-100 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-stone-400 font-mono">{agentDisplay}</p>
                  <StatusBadge status={ex.status} />
                </div>

                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span>{amountIn} {tokenSymbol(inAddr)}</span>
                  <span className="text-stone-300">→</span>
                  <span>{amountOut} {tokenSymbol(outAddr)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-xs text-stone-400">
                    {formatDistanceToNow(new Date(ex.executedAt), { addSuffix: true })}
                  </p>
                  <a
                    href={txExplorerUrl(ex.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline font-mono"
                  >
                    {ex.txHash.slice(0, 10)}...
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
