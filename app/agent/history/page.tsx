'use client'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { USE_MOCK, MOCK_EXECUTIONS, MOCK_AGENT, apiFetch, tokenDecimals, tokenSymbol } from '@/lib/mock-data'
import { txExplorerUrl } from '@/lib/constants'
import type { Execution, PaginatedResponse } from '@/types'
import { useLocalStorageValue } from '@/lib/client-storage'

// History executions use the strategy's tokenIn/tokenOut when available.
// Fall back to WETH (18 dec) for amountIn and USDC (6 dec) for amountOut
// to match the default DCA strategy direction.
const WETH = '0x4200000000000000000000000000000000000006'
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1'

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

// Execution type doesn't carry token addresses; use WETH/USDC as canonical defaults
// for the standard DCA direction. Extend here when the API adds tokenIn/tokenOut.
type ExecutionWithTokens = Execution & { tokenIn?: string; tokenOut?: string }
type ExecutionHistoryResponse = PaginatedResponse<ExecutionWithTokens>

const fetcher = async (url: string): Promise<ExecutionWithTokens[]> => {
  const response = await apiFetch<ExecutionHistoryResponse>(url)
  return response.data
}

export default function HistoryPage() {
  const agentId = useLocalStorageValue('hbc_agentId')

  const { data: executions, error, mutate, isLoading } = useSWR<ExecutionWithTokens[]>(
    agentId ? `/api/executions?agentId=${agentId}` : null,
    fetcher,
    {
      fallbackData: USE_MOCK ? (MOCK_EXECUTIONS as unknown as ExecutionWithTokens[]) : undefined,
      refreshInterval: 30000,
    }
  )

  const agentDisplay = USE_MOCK
    ? MOCK_AGENT.ensName ?? MOCK_AGENT.walletAddress.slice(0, 10)
    : agentId?.slice(0, 10) ?? '...'

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
      ) : isLoading && !executions ? (
        <div className="space-y-2">
          <ExecutionSkeleton />
          <ExecutionSkeleton />
          <ExecutionSkeleton />
        </div>
      ) : !executions || executions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <p className="text-stone-400 text-sm">No executions yet.</p>
          <p className="text-stone-300 text-xs">Assign a strategy and approve a proposal to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {executions.map(ex => {
            const inAddr  = ex.tokenIn  ?? WETH
            const outAddr = ex.tokenOut ?? USDC
            const amountIn  = (Number(BigInt(ex.amountIn))  / 10 ** tokenDecimals(inAddr)).toFixed(4)
            const amountOut = (Number(BigInt(ex.amountOut)) / 10 ** tokenDecimals(outAddr)).toFixed(2)

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
