// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { Agent, AgentStrategy } from '@/types'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

vi.mock('@/lib/constants', () => ({
  TOKEN_MAP: {
    '0x4200000000000000000000000000000000000006': { symbol: 'WETH', color: '#3b82f6' },
    '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1': { symbol: 'USDC', color: '#16a34a' },
  },
  txExplorerUrl: (hash: string) => `https://worldscan.org/tx/${hash}`,
}))

const mockSetAgentId = vi.fn()
vi.mock('@/components/use-agent-id', () => ({
  useAgentId: () => ({
    agentId: 'agent-123',
    hydrated: true,
    isResolving: false,
    setAgentId: mockSetAgentId,
  }),
}))

type ExecutionRow = {
  id: string
  agentId: string
  strategyId: string
  proposalId: string
  txHash: string
  amountIn: string
  amountOut: string
  status: 'confirmed'
  executedAt: string
  tokenIn?: string
  tokenOut?: string
}

const executionState: {
  data: { data: ExecutionRow[]; nextCursor: string | null } | undefined
  error: Error | undefined
  isLoading: boolean
  mutate: ReturnType<typeof vi.fn>
} = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }

const agentState = {
  data: {
    id: 'agent-123',
    ownerId: 'user-1',
    walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    ensName: 'demo.provix.eth',
    status: 'active',
    usageCount: 1,
    freeTrialRemaining: 2,
    spendLimits: { maxPerTx: '1000000000', dailyCap: '5000000000' },
    createdAt: new Date().toISOString(),
  } satisfies Agent,
  error: undefined as Error | undefined,
  isLoading: false,
  mutate: vi.fn(),
}

const strategiesState: {
  data: AgentStrategy[]
  error: Error | undefined
  isLoading: boolean
  mutate: ReturnType<typeof vi.fn>
} = { data: [], error: undefined, isLoading: false, mutate: vi.fn() }

vi.mock('swr', () => ({
  default: (key: string | null) => {
    if (key === '/api/executions?agentId=agent-123') return executionState
    if (key === '/api/agents/agent-123') return agentState
    if (key === '/api/agents/agent-123/strategies') return strategiesState

    return { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
  },
}))

const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1'
const WBTC = '0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa'

const execution: ExecutionRow = {
  id: 'exec-1',
  agentId: 'agent-123',
  strategyId: 'strategy-1',
  proposalId: 'proposal-1',
  txHash: '0xdeadbeef1234567890abcdef',
  amountIn: '500000000000000000',
  amountOut: '912000000',
  status: 'confirmed',
  executedAt: new Date(Date.now() - 3_600_000).toISOString(),
}

async function renderPage() {
  const { default: HistoryPage } = await import('@/app/agent/history/page')
  return render(<HistoryPage />)
}

beforeEach(() => {
  executionState.data = undefined
  executionState.error = undefined
  executionState.isLoading = false
  executionState.mutate = vi.fn()
  strategiesState.data = []
  strategiesState.error = undefined
  strategiesState.isLoading = false
  strategiesState.mutate = vi.fn()
  mockSetAgentId.mockReset()
})

describe('HistoryPage', () => {
  it('shows loading skeleton when executions are loading', async () => {
    executionState.isLoading = true
    await renderPage()
    expect(screen.queryByText('No executions yet.')).toBeNull()
  })

  it('shows empty state for a live agent with no executions yet', async () => {
    executionState.data = { data: [], nextCursor: null }
    await renderPage()
    expect(screen.getByText('No executions yet.')).toBeTruthy()
    expect(screen.getByText(/confirmed transaction will appear here automatically/)).toBeTruthy()
  })

  it('renders the paginated executions response shape from the backend', async () => {
    executionState.data = { data: [execution], nextCursor: null }
    await renderPage()
    expect(screen.getByText(/0\.5000 WETH/)).toBeTruthy()
    expect(screen.getByText(/912\.00 USDC/)).toBeTruthy()
  })

  it('links each execution to Worldscan', async () => {
    executionState.data = { data: [execution], nextCursor: null }
    await renderPage()
    const link = screen.getByText(/0xdeadbeef/).closest('a') as HTMLAnchorElement
    expect(link.href).toBe('https://worldscan.org/tx/0xdeadbeef1234567890abcdef')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('shows relative execution timestamps', async () => {
    executionState.data = { data: [execution], nextCursor: null }
    await renderPage()
    expect(screen.getByText(/ago/)).toBeTruthy()
  })

  it('shows retry UI when the executions request fails', async () => {
    executionState.error = new Error('Network error')
    await renderPage()
    expect(screen.getByText('Could not load history.')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('shows confirming text instead of a link when txHash is empty', async () => {
    executionState.data = {
      data: [{ ...execution, txHash: '' }],
      nextCursor: null,
    }
    await renderPage()
    expect(screen.getByText('confirming…')).toBeTruthy()
    expect(screen.queryByText(/0xdeadbeef/)).toBeNull()
  })

  it('uses strategy token metadata when executions omit token addresses', async () => {
    executionState.data = {
      data: [
        {
          ...execution,
          amountIn: '50000000',
          tokenIn: undefined,
          tokenOut: undefined,
        },
      ],
      nextCursor: null,
    }
    strategiesState.data = [
      {
        id: 'strategy-1',
        agentId: 'agent-123',
        name: 'Weekly WBTC DCA',
        tokenIn: WBTC,
        tokenOut: USDC,
        chainId: 480,
        amountPerInterval: '50000000',
        interval: 'weekly',
        autoExecute: false,
        status: 'active',
        createdAt: new Date().toISOString(),
      },
    ]

    await renderPage()
    expect(screen.getByText(/0\.5000 WBTC/)).toBeTruthy()
    expect(screen.getByText(/912\.00 USDC/)).toBeTruthy()
  })
})
