// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/constants', () => ({
  txExplorerUrl: (hash: string) => `https://worldscan.org/tx/${hash}`,
}))

vi.mock('@/lib/mock-data', () => ({
  USE_MOCK: false,
  MOCK_EXECUTIONS: [],
  MOCK_AGENT: { id: 'mock-agent-1', ensName: null, walletAddress: '0x1234567890abcdef' },
  apiFetch: vi.fn(),
  tokenDecimals: (address: string) => {
    if (address === '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1') return 6
    return 18
  },
  tokenSymbol: (address: string) => {
    const map: Record<string, string> = {
      '0x4200000000000000000000000000000000000006': 'WETH',
      '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1': 'USDC',
    }
    return map[address] ?? address.slice(0, 6) + '…'
  },
}))

const swrData = { data: undefined as any, error: undefined as any, isLoading: false }
vi.mock('swr', () => ({
  default: (_key: any, _fetcher: any, _opts: any) => ({ ...swrData, mutate: vi.fn() }),
}))

const WETH = '0x4200000000000000000000000000000000000006'
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1'

const execution = {
  id: 'exec-1', agentId: 'agent-1', strategyId: 'strat-1', proposalId: 'prop-1',
  txHash: '0xdeadbeef1234567890abcdef',
  amountIn:  '500000000000000000', // 0.5 WETH (18 dec)
  amountOut: '912000000',          // 912 USDC  (6 dec)
  status: 'confirmed' as const,
  executedAt: new Date(Date.now() - 3_600_000).toISOString(),
}

beforeEach(() => {
  swrData.data      = undefined
  swrData.error     = undefined
  swrData.isLoading = false
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => k === 'hbc_agentId' ? 'agent-123' : null,
    setItem: vi.fn(),
  })
})

async function renderPage() {
  const { default: HistoryPage } = await import('@/app/agent/history/page')
  return render(<HistoryPage />)
}

describe('HistoryPage', () => {
  it('shows loading skeleton when isLoading', async () => {
    swrData.isLoading = true
    await renderPage()
    expect(screen.queryByText('No executions yet.')).toBeNull()
  })

  it('shows empty state when executions array is empty', async () => {
    swrData.data = []
    await renderPage()
    expect(screen.getByText('No executions yet.')).toBeTruthy()
  })

  it('shows empty state helper text', async () => {
    swrData.data = []
    await renderPage()
    expect(screen.getByText(/Assign a strategy/)).toBeTruthy()
  })

  it('renders execution with correct WETH amount', async () => {
    swrData.data = [execution]
    await renderPage()
    // 0.5000 WETH
    expect(screen.getByText(/0\.5000 WETH/)).toBeTruthy()
  })

  it('renders execution with correct USDC amount', async () => {
    swrData.data = [execution]
    await renderPage()
    // 912.00 USDC
    expect(screen.getByText(/912\.00 USDC/)).toBeTruthy()
  })

  it('tx link points to correct worldscan URL', async () => {
    swrData.data = [execution]
    await renderPage()
    const link = screen.getByText(/0xdeadbeef/).closest('a') as HTMLAnchorElement
    expect(link.href).toBe('https://worldscan.org/tx/0xdeadbeef1234567890abcdef')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('shows relative timestamp', async () => {
    swrData.data = [execution]
    await renderPage()
    // "about 1 hour ago" or similar
    expect(screen.getByText(/ago/)).toBeTruthy()
  })

  it('shows error state and retry button on failure', async () => {
    swrData.error = new Error('Network error')
    await renderPage()
    expect(screen.getByText('Could not load history.')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('uses token addresses for dynamic decimals when present', async () => {
    // Execution with explicit tokenIn/tokenOut fields (future API enrichment)
    swrData.data = [{ ...execution, tokenIn: WETH, tokenOut: USDC }]
    await renderPage()
    expect(screen.getByText(/0\.5000 WETH/)).toBeTruthy()
    expect(screen.getByText(/912\.00 USDC/)).toBeTruthy()
  })
})
