'use client'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { USE_MOCK, MOCK_EXECUTIONS, MOCK_AGENT, apiFetch } from '@/lib/mock-data'
import { TOKEN_MAP, txExplorerUrl } from '@/lib/constants'
import type { Execution } from '@/types'

const fetcher = (url: string) => apiFetch<Execution[]>(url)

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

export default function HistoryPage() {
  const [agentId, setAgentId] = useState<string | null>(null)

  useEffect(() => {
    setAgentId(localStorage.getItem('hbc_agentId'))
  }, [])

  const { data: executions } = useSWR<Execution[]>(
    agentId ? `/api/executions?agentId=${agentId}` : null,
    fetcher,
    { fallbackData: USE_MOCK ? (MOCK_EXECUTIONS as unknown as Execution[]) : undefined }
  )

  return (
    <div className="min-h-screen px-5 pt-8 pb-4 space-y-4">
      <h1 className="text-xl font-bold">History</h1>

      {!executions || executions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <p className="text-stone-400 text-sm">No executions yet.</p>
          <p className="text-stone-300 text-xs">Assign a strategy and approve a proposal to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {executions.map(ex => {
            const amountIn = (Number(BigInt(ex.amountIn)) / 10 ** 18).toFixed(4)
            const amountOut = (Number(BigInt(ex.amountOut)) / 10 ** 6).toFixed(2)
            const agentDisplay = USE_MOCK
              ? MOCK_AGENT.ensName ?? MOCK_AGENT.walletAddress.slice(0, 10)
              : agentId?.slice(0, 10) ?? '...'

            return (
              <div key={ex.id} className="bg-white rounded-xl p-3 shadow-sm border border-stone-100 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-stone-400 font-mono">{agentDisplay}</p>
                  <StatusBadge status={ex.status} />
                </div>

                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span>{amountIn} WETH</span>
                  <span className="text-stone-300">→</span>
                  <span>{amountOut} USDC</span>
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
