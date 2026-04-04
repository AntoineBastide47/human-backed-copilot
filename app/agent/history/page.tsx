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
import type { Agent, AgentStrategy, PaginatedResponse } from '@/types'

const WETH = '0x4200000000000000000000000000000000000006'
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1'

const executionsFetcher = async (url: string) =>
  normalizeExecutionPage(await fetchJson<unknown>(url))

function ExecutionSkeleton() {
  return (
    <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/5 animate-pulse space-y-3">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-container" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-20 bg-surface-container-high rounded" />
            <div className="h-2.5 w-16 bg-surface-container rounded" />
          </div>
        </div>
        <div className="h-6 w-16 bg-surface-container-high rounded-md" />
      </div>
      <div className="h-px bg-surface-container-low" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-10 bg-surface-container-low rounded" />
        <div className="h-10 bg-surface-container-low rounded" />
      </div>
    </div>
  )
}

const statusConfig: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'FILLED',    className: 'bg-surface-container-high text-tertiary' },
  pending:   { label: 'PENDING',   className: 'bg-secondary-container text-on-secondary-container' },
  failed:    { label: 'FAILED',    className: 'bg-error-container/20 text-error' },
}

export default function HistoryPage() {
  const { agentId, hydrated, isResolving, setAgentId } = useAgentId()

  const executionsKey = agentId ? `/api/executions?agentId=${agentId}` : null
  const agentKey = agentId ? `/api/agents/${agentId}` : null
  const strategiesKey = agentId ? `/api/agents/${agentId}/strategies` : null

  const { data: executionPage, error, mutate, isLoading } = useSWR<PaginatedResponse<ExecutionRecord>>(
    executionsKey,
    executionsFetcher,
    { refreshInterval: 15000 }
  )
  const { data: agent } = useSWR<Agent>(agentKey, (url: string) => fetchJson<Agent>(url), { refreshInterval: 30000 })
  const { data: strategies } = useSWR<AgentStrategy[]>(strategiesKey, (url: string) => fetchJson<AgentStrategy[]>(url), { refreshInterval: 30000 })

  useEffect(() => {
    if (isApiError(error) && error.status === 404) setAgentId(null)
  }, [error, setAgentId])

  if (!agentId && isResolving) {
    return (
      <div className="px-4 mt-4 space-y-4">
        <div className="h-8 w-48 bg-surface-container rounded animate-pulse" />
        <ExecutionSkeleton />
        <ExecutionSkeleton />
      </div>
    )
  }

  if (!agentId && hydrated) {
    return (
      <div className="px-4 mt-4">
        <div className="bg-surface-container-lowest rounded-xl p-6 outline outline-1 outline-outline-variant/10 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-on-surface-variant text-2xl">history</span>
          </div>
          <h1 className="text-xl font-bold text-on-surface">No Agent Found</h1>
          <p className="text-sm text-on-surface-variant">
            Approve a live proposal first, then execution history will appear here automatically.
          </p>
          <Link href="/agent/setup" className="block bg-[#162238] text-white rounded-xl py-3 text-sm font-bold">
            Register Agent
          </Link>
        </div>
      </div>
    )
  }

  const executions = executionPage?.data ?? []
  const strategyTokensById = Object.fromEntries(
    (strategies ?? []).map((s) => [s.id, { tokenIn: s.tokenIn, tokenOut: s.tokenOut }])
  ) as Record<string, { tokenIn: string; tokenOut: string }>

  const confirmedCount = executions.filter(e => e.status === 'confirmed').length

  return (
    <div className="px-4 mt-4 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Execution History</h1>
        <p className="text-on-surface-variant text-sm font-medium mt-1">
          Audit log of all confirmed trade executions.
        </p>
      </div>

      {/* Summary stats */}
      <section className="grid grid-cols-2 gap-4">
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-[0.6875rem] font-medium tracking-[0.05em] uppercase text-on-surface-variant mb-1">
            Total Executions
          </p>
          <h2 className="text-xl font-extrabold text-on-surface">{executions.length}</h2>
          <div className="mt-2 flex items-center text-[0.625rem] text-tertiary">
            <span className="material-symbols-outlined text-sm mr-1">trending_up</span>
            <span>{confirmedCount} confirmed</span>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-[0.6875rem] font-medium tracking-[0.05em] uppercase text-on-surface-variant mb-1">
            Agent
          </p>
          <h2 className="text-sm font-extrabold text-on-surface truncate">
            {agent?.ensName ?? agentId?.slice(0, 12) ?? '—'}
          </h2>
          <div className="mt-2 flex items-center text-[0.625rem] text-on-surface-variant">
            <span className="material-symbols-outlined text-sm mr-1">verified</span>
            <span>World ID verified</span>
          </div>
        </div>
      </section>

      {/* Audit log */}
      <div className="flex justify-between items-center px-1">
        <h3 className="text-lg font-bold tracking-tight text-on-surface">Execution Audit Log</h3>
        <span className="material-symbols-outlined text-secondary">filter_list</span>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <p className="text-error text-sm">Could not load history.</p>
          <button
            onClick={() => mutate()}
            className="px-4 py-2 bg-[#162238] text-white rounded-xl text-sm font-semibold"
          >
            Retry
          </button>
        </div>
      ) : isLoading && !executionPage ? (
        <div className="space-y-3">
          <ExecutionSkeleton />
          <ExecutionSkeleton />
          <ExecutionSkeleton />
        </div>
      ) : executions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center">
            <span className="material-symbols-outlined text-on-surface-variant text-3xl">history</span>
          </div>
          <p className="text-on-surface-variant text-sm font-medium">No executions yet.</p>
          <p className="text-on-surface-variant/60 text-xs max-w-xs">
            Approve a live proposal and the confirmed transaction will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {executions.map(ex => {
            const strategyTokens = strategyTokensById[ex.strategyId]
            const inAddr = ex.tokenIn ?? strategyTokens?.tokenIn ?? WETH
            const outAddr = ex.tokenOut ?? strategyTokens?.tokenOut ?? USDC
            const amountIn = formatTokenAmount(ex.amountIn, inAddr, 4)
            const amountOut = formatTokenAmount(ex.amountOut, outAddr, 2)
            const inSym = tokenSymbol(inAddr)
            const outSym = tokenSymbol(outAddr)
            const cfg = statusConfig[ex.status] ?? statusConfig.pending

            return (
              <div
                key={ex.id}
                className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/5"
              >
                {/* Token + status */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center">
                      <span className="text-xs font-bold text-secondary">{inSym.slice(0, 4)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-on-surface">{inSym} → {outSym}</p>
                      <p className="text-[0.625rem] uppercase tracking-wider text-on-surface-variant">
                        World Chain · Swap
                      </p>
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded-md text-[0.625rem] font-bold ${cfg.className}`}>
                    {cfg.label}
                  </div>
                </div>

                {/* Amounts */}
                <div className="grid grid-cols-2 gap-4 py-3 border-t border-surface-container-low">
                  <div>
                    <p className="text-[0.6875rem] uppercase tracking-widest text-on-surface-variant">Sold</p>
                    <p className="text-sm font-semibold text-on-surface">{amountIn} {inSym}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.6875rem] uppercase tracking-widest text-on-surface-variant">Received</p>
                    <p className="text-sm font-semibold text-on-surface">{amountOut} {outSym}</p>
                  </div>
                </div>

                {/* Timestamp + tx link */}
                <div className="flex justify-between items-center pt-3 border-t border-surface-container-low">
                  <div className="flex items-center gap-1.5 text-[0.6875rem] text-on-surface-variant">
                    <span className="material-symbols-outlined text-xs">schedule</span>
                    <span>{formatDistanceToNow(new Date(ex.executedAt), { addSuffix: true })}</span>
                  </div>
                  {ex.txHash ? (
                    <a
                      href={txExplorerUrl(ex.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[0.6875rem] font-medium text-secondary-dim flex items-center gap-1 font-mono"
                    >
                      {ex.txHash.slice(0, 10)}...
                      <span className="material-symbols-outlined text-xs">open_in_new</span>
                    </a>
                  ) : (
                    <span className="text-xs text-on-surface-variant/50 italic">confirming…</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
