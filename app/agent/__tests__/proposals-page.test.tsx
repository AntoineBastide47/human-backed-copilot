// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import type { ReactNode } from 'react'
import type { Proposal } from '@/types'

type LinkProps = {
  href: string
  children: ReactNode
  className?: string
}

type ProposalWithTxHash = Proposal & { txHash?: string }
type SwrState = {
  data: ProposalWithTxHash[] | undefined
  error: Error | undefined
  isLoading: boolean
}

// ── Stable mocks ────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, className }: LinkProps) => <a href={href} className={className}>{children}</a>,
}))
vi.mock('@/lib/constants', () => ({
  TOKEN_MAP: {
    '0x4200000000000000000000000000000000000006': { symbol: 'WETH', color: '#3b82f6' },
    '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1': { symbol: 'USDC', color: '#16a34a' },
  },
  txExplorerUrl: (hash: string) => `https://worldscan.org/tx/${hash}`,
}))

const mockApiFetch = vi.fn()
vi.mock('@/lib/mock-data', () => ({
  USE_MOCK: false,
  MOCK_PROPOSALS: [],
  MOCK_AGENT: { id: 'mock-agent-1' },
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

// ── SWR mock — writable so each test can control the response ────────────────
const swrData: SwrState = { data: undefined, error: undefined, isLoading: false }
vi.mock('swr', () => ({
  default: () => ({ ...swrData, mutate: vi.fn() }),
}))

const WETH = '0x4200000000000000000000000000000000000006'
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1'

const pending = {
  id: 'prop-1', agentId: 'a1', strategyId: 's1',
  type: 'dca_buy' as const, tokenIn: WETH, tokenOut: USDC,
  amount: '500000000000000000', estimatedOutput: '925000000',
  reasoning: 'DCA buy', status: 'pending' as const,
  createdAt: new Date().toISOString(),
}

// ── localStorage stub ────────────────────────────────────────────────────────
beforeEach(() => {
  swrData.data      = undefined
  swrData.error     = undefined
  swrData.isLoading = false
  mockApiFetch.mockReset()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => key === 'hbc_agentId' ? 'agent-123' : null,
    setItem: vi.fn(),
  })
})

async function renderPage() {
  const { default: ProposalsPage } = await import('@/app/agent/proposals/page')
  return render(<ProposalsPage />)
}

describe('ProposalsPage', () => {
  it('shows loading skeleton when isLoading', async () => {
    swrData.isLoading = true
    await renderPage()
    // Skeletons are animate-pulse divs — check for absence of empty-state text
    expect(screen.queryByText('No pending proposals.')).toBeNull()
  })

  it('shows empty state when proposals array is empty', async () => {
    swrData.data = []
    await renderPage()
    expect(screen.getByText('No pending proposals.')).toBeTruthy()
  })

  it('renders proposal cards from SWR data', async () => {
    swrData.data = [pending]
    await renderPage()
    expect(screen.getByText('DCA buy')).toBeTruthy()
  })

  it('shows pending count badge in heading when there are pending proposals', async () => {
    swrData.data = [pending]
    await renderPage()
    // The badge shows the count
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('shows error state when SWR returns an error', async () => {
    swrData.error = new Error('Network error')
    await renderPage()
    expect(screen.getByText('Could not load proposals.')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('calls approve endpoint on approve click', async () => {
    swrData.data = [pending]
    mockApiFetch.mockResolvedValue({ success: true, txHash: '0xdeadbeef' })
    await renderPage()
    const approveBtn = screen.getByTestId('approve-button')
    fireEvent.click(approveBtn)
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/approve'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('calls reject endpoint on reject click', async () => {
    swrData.data = [pending]
    mockApiFetch.mockResolvedValue({ success: true })
    await renderPage()
    const rejectBtn = screen.getByTestId('reject-button')
    fireEvent.click(rejectBtn)
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/reject'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('shows success toast after approval', async () => {
    swrData.data = [pending]
    mockApiFetch.mockResolvedValue({ success: true, txHash: '0xdeadbeef12345' })
    await renderPage()
    fireEvent.click(screen.getByTestId('approve-button'))
    await waitFor(() => {
      expect(screen.getByText(/Executed!/)).toBeTruthy()
    })
  })

  it('shows error toast when approval fails', async () => {
    swrData.data = [pending]
    mockApiFetch.mockRejectedValue(new Error('Swap failed'))
    await renderPage()
    fireEvent.click(screen.getByTestId('approve-button'))
    await waitFor(() => {
      expect(screen.getByText('Swap failed')).toBeTruthy()
    })
  })
})
