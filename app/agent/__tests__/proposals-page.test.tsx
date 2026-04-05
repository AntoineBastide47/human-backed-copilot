// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

const mockSendTransaction = vi.fn()
const mockMiniKitInstalled = vi.fn(() => true)
vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: {
    isInstalled: () => mockMiniKitInstalled(),
    sendTransaction: (...args: unknown[]) => mockSendTransaction(...args),
  },
}))

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
  WORLD_CHAIN_ID: 480,
  txExplorerUrl: (hash: string) => `https://worldscan.org/tx/${hash}`,
}))

const mockFetchJson = vi.fn()
const mockIsApiError = vi.fn((_: unknown) => false)
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
  triggerType: null,
  triggerSummary: null,
  notionalUsd: null,
  expectedSlippageBps: null,
  marketSnapshot: null,
  createdAt: new Date().toISOString(),
}

const richProposal = {
  ...pendingProposal,
  id: 'prop-rich',
  type: 'rebalance' as const,
  triggerType: 'rebalance_drift',
  triggerSummary: 'Portfolio drift exceeded 5.00% rebalance band',
  notionalUsd: '1500000000',
  expectedSlippageBps: 50,
  marketSnapshot: {
    currentAllocationBps: 6800,
    targetAllocationBps: 6000,
    driftBps: 800,
    quotedAt: new Date().toISOString(),
  },
  reasoning: 'USDC allocation is 68.0%, target is 60.0%, drift of 8.0%. Selling USDC for WETH.',
}

const oldProposal = {
  id: 'prop-old',
  agentId: 'agent-123',
  strategyId: 'strategy-1',
  type: 'dca_buy' as const,
  tokenIn: WETH,
  tokenOut: USDC,
  amount: '500000000000000000',
  estimatedOutput: '925000000',
  reasoning: 'Legacy DCA buy',
  status: 'pending' as const,
  triggerType: null,
  triggerSummary: null,
  notionalUsd: null,
  expectedSlippageBps: null,
  marketSnapshot: null,
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
  mockSendTransaction.mockReset()
  mockMiniKitInstalled.mockReset()
  mockMiniKitInstalled.mockReturnValue(true)
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
    mockFetchJson
      .mockResolvedValueOnce({
        success: true,
        transactions: [{ to: '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9', data: '0x1234' }],
        amountIn: pendingProposal.amount,
        amountOut: pendingProposal.estimatedOutput,
        approvalNeeded: false,
        debug: {
          walletAddress: '0x' + 'a'.repeat(40),
          transactionTargets: ['0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9'],
          tokenIn: WETH,
          spender: '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9',
          currentAllowance: '1000000000000000000',
        },
      })
      .mockResolvedValueOnce({ success: true, txHash: '0x' + '1'.repeat(64) })
    mockSendTransaction.mockResolvedValue({
      data: { userOpHash: '0x' + '2'.repeat(64) },
    })

    await renderPage()
    fireEvent.click(screen.getByTestId('approve-button'))

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith(
        '/api/agents/agent-123/approve',
        expect.objectContaining({ method: 'POST' })
      )
    })

    expect(mockSendTransaction).toHaveBeenCalledWith({
      chainId: 480,
      transactions: [{ to: '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9', data: '0x1234' }],
    })

    expect(mockMutate).toHaveBeenCalledWith([], { revalidate: false })
    expect(mockCacheMutate).toHaveBeenCalledWith('/api/executions?agentId=agent-123')

    await waitFor(() => {
      expect(screen.getByText('Trade confirmed on World Chain.')).toBeTruthy()
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
    mockMiniKitInstalled.mockReturnValue(true)
    mockFetchJson.mockRejectedValue(new Error('Swap failed'))

    await renderPage()
    fireEvent.click(screen.getByTestId('approve-button'))

    await waitFor(() => {
      expect(screen.getByText('Swap failed')).toBeTruthy()
    })
  })

  it('shows allowlist contract addresses when World App rejects invalid_contract', async () => {
    swrState.data = [pendingProposal]
    mockFetchJson
      .mockResolvedValueOnce({
        success: true,
        transactions: [
          { to: WETH, data: '0xaaaa' },
          { to: '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9', data: '0xbbbb' },
        ],
        amountIn: pendingProposal.amount,
        amountOut: pendingProposal.estimatedOutput,
        approvalNeeded: true,
        debug: {
          walletAddress: '0x' + 'a'.repeat(40),
          transactionTargets: [WETH, '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9'],
          tokenIn: WETH,
          spender: '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9',
          currentAllowance: '0',
        },
      })
      .mockResolvedValueOnce({ cancelled: true })
    mockSendTransaction.mockRejectedValue(new Error('invalid_contract'))

    await renderPage()
    fireEvent.click(screen.getByTestId('approve-button'))

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith(
        '/api/agents/agent-123/approve/cancel',
        expect.objectContaining({ method: 'POST' })
      )
    })

    await waitFor(() => {
      expect(screen.getByText(new RegExp(`Whitelist these Contract Entrypoints:\\s*${WETH}\\s*0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9`))).toBeTruthy()
    })
  })

  it('shows a World App message when MiniKit is unavailable', async () => {
    swrState.data = [pendingProposal]
    mockMiniKitInstalled.mockReturnValue(false)

    await renderPage()
    fireEvent.click(screen.getByTestId('approve-button'))

    await waitFor(() => {
      expect(screen.getByText('Open this mini app in World App to approve trades.')).toBeTruthy()
    })
  })

  it('shows prep wallet and transaction targets when simulation fails', async () => {
    swrState.data = [pendingProposal]
    mockFetchJson
      .mockResolvedValueOnce({
        success: true,
        transactions: [{ to: WETH, data: '0xaaaa' }],
        amountIn: pendingProposal.amount,
        amountOut: pendingProposal.estimatedOutput,
        approvalNeeded: false,
        debug: {
          walletAddress: '0xc7718af184004c606c7fde786f529e13238f26c8',
          transactionTargets: [WETH],
          tokenIn: WETH,
          spender: WETH,
          currentAllowance: '0',
        },
      })
      .mockResolvedValueOnce({ cancelled: true })
    mockSendTransaction.mockRejectedValue(new Error('simulation_failed'))

    await renderPage()
    fireEvent.click(screen.getByTestId('approve-button'))

    await waitFor(() => {
    expect(screen.getByText(/World App simulation failed\./)).toBeTruthy()
    })

    expect(screen.getByText(/Prep wallet: 0xc7718af184004c606c7fde786f529e13238f26c8/)).toBeTruthy()
    expect(screen.getByText(new RegExp(`Token in: ${WETH}`))).toBeTruthy()
    expect(screen.getByText(/Permit2 allowance: 0/)).toBeTruthy()
    expect(screen.getByText(new RegExp(WETH))).toBeTruthy()
  })

  // ── Phase 3: structured proposal metadata ───────────────────────────

  it('shows trigger summary when present', async () => {
    swrState.data = [richProposal]
    await renderPage()
    expect(screen.getByTestId('trigger-summary')).toBeTruthy()
    expect(screen.getByText(/Portfolio drift exceeded/)).toBeTruthy()
  })

  it('shows allocation drift when marketSnapshot has allocation data', async () => {
    swrState.data = [richProposal]
    await renderPage()
    expect(screen.getByTestId('allocation-drift')).toBeTruthy()
    expect(screen.getByText('68.0%')).toBeTruthy()
    expect(screen.getByText('60.0%')).toBeTruthy()
  })

  it('shows notional USD when present', async () => {
    swrState.data = [richProposal]
    await renderPage()
    expect(screen.getByTestId('notional-usd')).toBeTruthy()
    expect(screen.getByText('$1500')).toBeTruthy()
  })

  it('gracefully renders old proposals without new fields', async () => {
    swrState.data = [oldProposal]
    await renderPage()
    expect(screen.getByText('Legacy DCA buy')).toBeTruthy()
    expect(screen.queryByTestId('trigger-summary')).toBeNull()
    expect(screen.queryByTestId('allocation-drift')).toBeNull()
    expect(screen.queryByTestId('notional-usd')).toBeNull()
  })

  it('renders mixed old and new proposals together', async () => {
    swrState.data = [richProposal, oldProposal]
    await renderPage()
    expect(screen.getByText(/Portfolio drift exceeded/)).toBeTruthy()
    expect(screen.getByText('Legacy DCA buy')).toBeTruthy()
  })
})
