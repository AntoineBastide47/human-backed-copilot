// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProposalCard } from '@/components/proposal-card'
import type { Proposal } from '@/types'

vi.mock('@/lib/constants', () => ({
  TOKEN_MAP: {
    '0x4200000000000000000000000000000000000006': { symbol: 'WETH', color: '#3b82f6' },
    '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1': { symbol: 'USDC', color: '#16a34a' },
  },
  txExplorerUrl: (hash: string) => `https://worldscan.org/tx/${hash}`,
}))

const WETH = '0x4200000000000000000000000000000000000006'
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1'

const pendingProposal: Proposal & { txHash?: string } = {
  id: 'prop-1',
  agentId: 'agent-1',
  strategyId: 'strat-1',
  type: 'dca_buy',
  tokenIn: WETH,
  tokenOut: USDC,
  amount: '500000000000000000',      // 0.5 WETH
  estimatedOutput: '925000000',       // 925 USDC
  reasoning: 'DCA #4 of daily plan',
  status: 'pending',
  createdAt: new Date(Date.now() - 60_000).toISOString(),
}

const executedProposal: Proposal & { txHash?: string } = {
  ...pendingProposal,
  id: 'prop-2',
  status: 'executed',
  txHash: '0xabc123def456789abcdef',
}

const rejectedProposal: Proposal & { txHash?: string } = {
  ...pendingProposal,
  id: 'prop-3',
  status: 'rejected',
}

function makeProps(overrides: Partial<Parameters<typeof ProposalCard>[0]> = {}) {
  return {
    proposal: pendingProposal,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    approvingId: null,
    rejectingId: null,
    ...overrides,
  }
}

describe('ProposalCard', () => {
  describe('pending proposal', () => {
    it('renders type badge as "DCA Buy"', () => {
      render(<ProposalCard {...makeProps()} />)
      expect(screen.getByTestId('proposal-type-badge').textContent).toBe('DCA Buy')
    })

    it('renders status badge as "pending"', () => {
      render(<ProposalCard {...makeProps()} />)
      expect(screen.getByTestId('proposal-status-badge').textContent).toBe('pending')
    })

    it('renders token amounts with correct symbols', () => {
      render(<ProposalCard {...makeProps()} />)
      expect(screen.getByTestId('amount-in').textContent).toContain('WETH')
      expect(screen.getByTestId('amount-out').textContent).toContain('USDC')
    })

    it('formats WETH amount to 4 decimal places', () => {
      render(<ProposalCard {...makeProps()} />)
      expect(screen.getByTestId('amount-in').textContent).toContain('0.5000')
    })

    it('formats USDC output to 2 decimal places', () => {
      render(<ProposalCard {...makeProps()} />)
      expect(screen.getByTestId('amount-out').textContent).toContain('925.00')
    })

    it('renders Approve and Reject buttons', () => {
      render(<ProposalCard {...makeProps()} />)
      expect(screen.getByTestId('approve-button')).toBeTruthy()
      expect(screen.getByTestId('reject-button')).toBeTruthy()
    })

    it('calls onApprove with proposal id when Approve clicked', () => {
      const onApprove = vi.fn()
      render(<ProposalCard {...makeProps({ onApprove })} />)
      fireEvent.click(screen.getByTestId('approve-button'))
      expect(onApprove).toHaveBeenCalledWith('prop-1')
    })

    it('calls onReject with proposal id when Reject clicked', () => {
      const onReject = vi.fn()
      render(<ProposalCard {...makeProps({ onReject })} />)
      fireEvent.click(screen.getByTestId('reject-button'))
      expect(onReject).toHaveBeenCalledWith('prop-1')
    })

    it('shows reasoning text', () => {
      render(<ProposalCard {...makeProps()} />)
      expect(screen.getByText('DCA #4 of daily plan')).toBeTruthy()
    })

    it('does not render tx link when no txHash', () => {
      render(<ProposalCard {...makeProps()} />)
      expect(screen.queryByTestId('tx-link')).toBeNull()
    })
  })

  describe('disabled state while approving', () => {
    it('disables both buttons when approvingId matches', () => {
      render(<ProposalCard {...makeProps({ approvingId: 'prop-1' })} />)
      const approveBtn = screen.getByTestId('approve-button') as HTMLButtonElement
      const rejectBtn  = screen.getByTestId('reject-button')  as HTMLButtonElement
      expect(approveBtn.disabled).toBe(true)
      expect(rejectBtn.disabled).toBe(true)
    })

    it('shows "Executing..." label while approving', () => {
      render(<ProposalCard {...makeProps({ approvingId: 'prop-1' })} />)
      expect(screen.getByTestId('approve-button').textContent).toBe('Executing...')
    })

    it('disables both buttons when rejectingId matches', () => {
      render(<ProposalCard {...makeProps({ rejectingId: 'prop-1' })} />)
      const approveBtn = screen.getByTestId('approve-button') as HTMLButtonElement
      expect(approveBtn.disabled).toBe(true)
    })

    it('shows "Rejecting..." label while rejecting', () => {
      render(<ProposalCard {...makeProps({ rejectingId: 'prop-1' })} />)
      expect(screen.getByTestId('reject-button').textContent).toBe('Rejecting...')
    })
  })

  describe('executed proposal', () => {
    it('shows tx link pointing to worldscan', () => {
      render(<ProposalCard {...makeProps({ proposal: executedProposal })} />)
      const link = screen.getByTestId('tx-link') as HTMLAnchorElement
      expect(link.href).toContain('worldscan.org/tx/0xabc123def456789abcdef')
    })

    it('does not render approve/reject buttons', () => {
      render(<ProposalCard {...makeProps({ proposal: executedProposal })} />)
      expect(screen.queryByTestId('approve-button')).toBeNull()
      expect(screen.queryByTestId('reject-button')).toBeNull()
    })

    it('shows "executed" status badge', () => {
      render(<ProposalCard {...makeProps({ proposal: executedProposal })} />)
      expect(screen.getByTestId('proposal-status-badge').textContent).toBe('executed')
    })
  })

  describe('rejected proposal', () => {
    it('does not render approve/reject buttons', () => {
      render(<ProposalCard {...makeProps({ proposal: rejectedProposal })} />)
      expect(screen.queryByTestId('approve-button')).toBeNull()
      expect(screen.queryByTestId('reject-button')).toBeNull()
    })

    it('shows "rejected" status badge', () => {
      render(<ProposalCard {...makeProps({ proposal: rejectedProposal })} />)
      expect(screen.getByTestId('proposal-status-badge').textContent).toBe('rejected')
    })
  })

  describe('rebalance type', () => {
    it('renders type badge as "Rebalance"', () => {
      render(<ProposalCard {...makeProps({ proposal: { ...pendingProposal, type: 'rebalance' } })} />)
      expect(screen.getByTestId('proposal-type-badge').textContent).toBe('Rebalance')
    })
  })
})
