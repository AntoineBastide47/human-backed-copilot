// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

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

const mockFetchJson = vi.fn()
const mockIsApiError = vi.fn(() => false)
vi.mock('@/components/sync4-client', async () => {
  const actual = await vi.importActual<typeof import('@/components/sync4-client')>(
    '@/components/sync4-client'
  )

  return {
    ...actual,
    fetchJson: (...args: [string, RequestInit?]) => mockFetchJson(...args),
    isApiError: (...args: [unknown]) => mockIsApiError(...args),
  }
})

const mockSetAgentId = vi.fn()
vi.mock('@/components/use-agent-id', () => ({
  useAgentId: () => ({
    agentId: 'agent-123',
    hydrated: true,
    isResolving: false,
    setAgentId: mockSetAgentId,
  }),
}))

const swrState = { data: undefined as unknown, error: undefined as Error | undefined, isLoading: false }
const mockMutate = vi.fn()
const mockCacheMutate = vi.fn()
vi.mock('swr', () => ({
  default: () => ({ ...swrState, mutate: mockMutate }),
  useSWRConfig: () => ({ mutate: mockCacheMutate }),
}))

const WETH = '0x4200000000000000000000000000000000000006'
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1'

const pendingProposal = {
  id: 'prop-1',
  agentId: 'agent-123',
  strategyId: 'strategy-1',
  type: 'dca_buy' as const,
  tokenIn: WETH,
  tokenOut: USDC,
  amount: '500000000000000000',
  estimatedOutput: '925000000',
  reasoning: 'DCA buy',
  status: 'pending' as const,
  createdAt: new Date().toISOString(),
}

async function renderPage() {
  const { default: ProposalsPage } = await import('@/app/agent/proposals/page')
  return render(<ProposalsPage />)
}

beforeEach(() => {
  swrState.data = undefined
  swrState.error = undefined
  swrState.isLoading = false
  mockFetchJson.mockReset()
  mockIsApiError.mockReset()
  mockIsApiError.mockReturnValue(false)
  mockMutate.mockReset()
  mockCacheMutate.mockReset()
  mockSetAgentId.mockReset()
})

describe('ProposalsPage', () => {
  it('shows loading skeleton when pending proposals are loading', async () => {
    swrState.isLoading = true
    await renderPage()
    expect(screen.queryByText('No pending proposals.')).toBeNull()
  })

  it('shows empty state when there are no pending proposals', async () => {
    swrState.data = []
    await renderPage()
    expect(screen.getByText('No pending proposals.')).toBeTruthy()
    expect(screen.getByText(/Live polling is on/)).toBeTruthy()
  })

  it('renders live proposals from SWR data', async () => {
    swrState.data = [pendingProposal]
    await renderPage()
    expect(screen.getByText('DCA buy')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('shows error state when the live proposals query fails', async () => {
    swrState.error = new Error('Network error')
    await renderPage()
    expect(screen.getByText('Could not load proposals.')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('approves a live proposal and updates the proposal cache immediately', async () => {
    swrState.data = [pendingProposal]
    mockFetchJson.mockResolvedValue({ success: true, txHash: '0xdeadbeef12345678' })

    await renderPage()
    fireEvent.click(screen.getByTestId('approve-button'))

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith(
        '/api/agents/agent-123/approve',
        expect.objectContaining({ method: 'POST' })
      )
    })

    expect(mockMutate).toHaveBeenCalledWith([], { revalidate: false })
    expect(mockCacheMutate).toHaveBeenCalledWith(
      '/api/executions?agentId=agent-123',
      expect.any(Function),
      { revalidate: false }
    )

    await waitFor(() => {
      expect(screen.getByText(/Executed on-chain/)).toBeTruthy()
    })
  })

  it('rejects a live proposal and removes it from the pending list', async () => {
    swrState.data = [pendingProposal]
    mockFetchJson.mockResolvedValue({ success: true })

    await renderPage()
    fireEvent.click(screen.getByTestId('reject-button'))

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith(
        '/api/agents/agent-123/reject',
        expect.objectContaining({ method: 'POST' })
      )
    })

    expect(mockMutate).toHaveBeenCalledWith([], { revalidate: false })
    await waitFor(() => {
      expect(screen.getByText('Proposal rejected')).toBeTruthy()
    })
  })

  it('shows backend errors when approval fails', async () => {
    swrState.data = [pendingProposal]
    mockFetchJson.mockRejectedValue(new Error('Swap failed'))

    await renderPage()
    fireEvent.click(screen.getByTestId('approve-button'))

    await waitFor(() => {
      expect(screen.getByText('Swap failed')).toBeTruthy()
    })
  })
})
