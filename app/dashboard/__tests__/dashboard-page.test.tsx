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

const makeAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'agent-123',
  ownerId: 'user-1',
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  ensName: 'demo.copilot.eth',
  status: 'active',
  usageCount: 5,
  freeTrialRemaining: 3,
  spendLimits: { maxPerTx: '1000000000', dailyCap: '5000000000' },
  createdAt: new Date().toISOString(),
  ...overrides,
})

const agentState: {
  data: Agent | undefined
  error: Error | undefined
  isLoading: boolean
  mutate: ReturnType<typeof vi.fn>
} = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }

const strategiesState: {
  data: AgentStrategy[] | undefined
  error: Error | undefined
  isLoading: boolean
  mutate: ReturnType<typeof vi.fn>
} = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }

const proposalsState: {
  data: { id: string }[] | undefined
  error: Error | undefined
  isLoading: boolean
  mutate: ReturnType<typeof vi.fn>
} = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }

vi.mock('swr', () => ({
  default: (key: string | null) => {
    if (key === '/api/agents/agent-123') return agentState
    if (key === '/api/agents/agent-123/strategies') return strategiesState
    if (key === '/api/agents/agent-123/proposals?status=pending') return proposalsState
    return { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
  },
}))

const strategy: AgentStrategy = {
  id: 'strategy-1',
  agentId: 'agent-123',
  name: 'Weekly WETH DCA',
  tokenIn: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
  tokenOut: '0x4200000000000000000000000000000000000006',
  chainId: 480,
  amountPerInterval: '10000000',
  interval: 'weekly',
  autoExecute: false,
  status: 'active',
  createdAt: new Date().toISOString(),
}

async function renderPage() {
  const { default: DashboardPage } = await import('@/app/dashboard/page')
  return render(<DashboardPage />)
}

beforeEach(() => {
  agentState.data = undefined
  agentState.error = undefined
  agentState.isLoading = false
  agentState.mutate = vi.fn()
  strategiesState.data = undefined
  strategiesState.error = undefined
  strategiesState.isLoading = false
  strategiesState.mutate = vi.fn()
  proposalsState.data = undefined
  proposalsState.error = undefined
  proposalsState.isLoading = false
  proposalsState.mutate = vi.fn()
  mockSetAgentId.mockReset()
})

describe('DashboardPage', () => {
  it('shows loading skeleton when agent is loading', async () => {
    agentState.isLoading = true
    await renderPage()
    expect(screen.queryByText('demo.copilot.eth')).toBeNull()
  })

  it('renders agent info for an active agent', async () => {
    agentState.data = makeAgent()
    strategiesState.data = []
    await renderPage()
    expect(screen.getByText('demo.copilot.eth')).toBeTruthy()
    expect(screen.getByText('active')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('shows registering banner when agent status is registering', async () => {
    agentState.data = makeAgent({ status: 'registering', ensName: null })
    strategiesState.data = []
    await renderPage()
    expect(screen.getByTestId('registering-notice')).toBeTruthy()
    expect(screen.queryByTestId('paused-notice')).toBeNull()
    expect(screen.queryByTestId('trial-exhausted-notice')).toBeNull()
  })

  it('shows paused banner when agent status is paused', async () => {
    agentState.data = makeAgent({ status: 'paused' })
    strategiesState.data = []
    await renderPage()
    expect(screen.getByTestId('paused-notice')).toBeTruthy()
    expect(screen.queryByTestId('registering-notice')).toBeNull()
  })

  it('shows trial-exhausted banner when freeTrialRemaining is 0 and agent is active', async () => {
    agentState.data = makeAgent({ freeTrialRemaining: 0 })
    strategiesState.data = []
    await renderPage()
    expect(screen.getByTestId('trial-exhausted-notice')).toBeTruthy()
  })

  it('does not show trial-exhausted banner when freeTrialRemaining is 1', async () => {
    agentState.data = makeAgent({ freeTrialRemaining: 1 })
    strategiesState.data = []
    await renderPage()
    expect(screen.queryByTestId('trial-exhausted-notice')).toBeNull()
  })

  it('does not show trial-exhausted banner when agent is paused even at 0 free', async () => {
    agentState.data = makeAgent({ freeTrialRemaining: 0, status: 'paused' })
    strategiesState.data = []
    await renderPage()
    expect(screen.queryByTestId('trial-exhausted-notice')).toBeNull()
  })

  it('renders strategy list', async () => {
    agentState.data = makeAgent()
    strategiesState.data = [strategy]
    await renderPage()
    expect(screen.getByText('Weekly WETH DCA')).toBeTruthy()
    expect(screen.getByText(/weekly/)).toBeTruthy()
  })

  it('shows empty state with add link when no strategies', async () => {
    agentState.data = makeAgent()
    strategiesState.data = []
    await renderPage()
    expect(screen.getByText(/No strategies yet/)).toBeTruthy()
    const addLink = screen.getByText('add one').closest('a') as HTMLAnchorElement
    expect(addLink.href).toContain('/agent/strategies')
  })

  it('shows pending proposals badge on View Proposals link', async () => {
    agentState.data = makeAgent()
    strategiesState.data = []
    proposalsState.data = [{ id: 'p1' }, { id: 'p2' }]
    await renderPage()
    expect(screen.getByTestId('proposals-link-badge').textContent).toBe('2')
  })

  it('caps pending badge at 9+', async () => {
    agentState.data = makeAgent()
    strategiesState.data = []
    proposalsState.data = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}` }))
    await renderPage()
    expect(screen.getByTestId('proposals-link-badge').textContent).toBe('9+')
  })

  it('does not show badge when no pending proposals', async () => {
    agentState.data = makeAgent()
    strategiesState.data = []
    proposalsState.data = []
    await renderPage()
    expect(screen.queryByTestId('proposals-link-badge')).toBeNull()
  })

  it('shows agent error state', async () => {
    agentState.error = new Error('Network error')
    await renderPage()
    expect(screen.getByText('Could not load agent data.')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('shows strategies error state', async () => {
    agentState.data = makeAgent()
    strategiesState.error = new Error('Network error')
    await renderPage()
    expect(screen.getByText('Could not load strategies.')).toBeTruthy()
  })

  it('shows ENS name when available, not raw address', async () => {
    agentState.data = makeAgent({ ensName: 'alice-dca.copilot.eth' })
    strategiesState.data = []
    await renderPage()
    expect(screen.getByText('alice-dca.copilot.eth')).toBeTruthy()
  })

  it('falls back to truncated address when ensName is null', async () => {
    agentState.data = makeAgent({ ensName: null })
    strategiesState.data = []
    await renderPage()
    expect(screen.getByText('0x123456...')).toBeTruthy()
  })
})
