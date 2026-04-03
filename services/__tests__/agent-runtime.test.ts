import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentStrategy, Proposal } from '@/types';

const mockGetAgentStrategies = vi.fn();
const mockCreateProposal = vi.fn();
const mockGetApprovedProposals = vi.fn();
const mockMarkProposalExecuted = vi.fn();
const mockGetQuote = vi.fn();
const mockExecuteSwap = vi.fn();

vi.mock('@/lib/agent-service', () => ({
  getAgentStrategies: (...args: unknown[]) => mockGetAgentStrategies(...args),
  createProposal: (...args: unknown[]) => mockCreateProposal(...args),
  getApprovedProposals: (...args: unknown[]) => mockGetApprovedProposals(...args),
  markProposalExecuted: (...args: unknown[]) => mockMarkProposalExecuted(...args),
}));

vi.mock('../uniswap', () => ({
  getQuote: (...args: unknown[]) => mockGetQuote(...args),
  executeSwap: (...args: unknown[]) => mockExecuteSwap(...args),
}));

const AGENT_ID = 'agent-123';

function makeStrategy(overrides: Partial<AgentStrategy> = {}): AgentStrategy {
  return {
    id: 'strat-1',
    agentId: AGENT_ID,
    name: 'Daily WETH→USDC',
    tokenIn: '0x4200000000000000000000000000000000000006',
    tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
    chainId: 480,
    amountPerInterval: '500000000000000000',
    interval: 'daily',
    autoExecute: false,
    status: 'active',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'prop-1',
    agentId: AGENT_ID,
    strategyId: 'strat-1',
    type: 'dca_buy',
    tokenIn: '0x4200000000000000000000000000000000000006',
    tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
    amount: '500000000000000000',
    estimatedOutput: '1000000',
    reasoning: 'DCA buy',
    status: 'approved',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('agent-runtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetAgentStrategies.mockReset();
    mockCreateProposal.mockReset();
    mockGetApprovedProposals.mockReset();
    mockMarkProposalExecuted.mockReset();
    mockGetQuote.mockReset();
    mockExecuteSwap.mockReset();

    mockGetApprovedProposals.mockResolvedValue([]);
    mockGetQuote.mockResolvedValue({
      quote: { quoteDecimals: '1000000' },
      gasEstimate: '150000',
    });
  });

  afterEach(async () => {
    const { stopAgentLoop } = await import('../agent-runtime');
    stopAgentLoop(AGENT_ID);
    vi.useRealTimers();
  });

  it('creates pending proposal for non-autoExecute strategy', async () => {
    const strategy = makeStrategy({ autoExecute: false });
    mockGetAgentStrategies.mockResolvedValue([strategy]);
    mockCreateProposal.mockResolvedValue(makeProposal({ status: 'pending' }));

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: AGENT_ID,
        strategyId: strategy.id,
        status: 'pending',
        type: 'dca_buy',
      }),
    );
    expect(mockExecuteSwap).not.toHaveBeenCalled();
  });

  it('auto-executes and marks proposal for autoExecute strategy', async () => {
    const strategy = makeStrategy({ autoExecute: true });
    mockGetAgentStrategies.mockResolvedValue([strategy]);
    mockCreateProposal.mockResolvedValue(makeProposal({ status: 'approved' }));
    mockExecuteSwap.mockResolvedValue({
      success: true,
      txHash: '0xtx123',
      amountIn: strategy.amountPerInterval,
      amountOut: '1000000',
    });

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }),
    );
    expect(mockExecuteSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenIn: strategy.tokenIn,
        tokenOut: strategy.tokenOut,
        chainId: 480,
        amount: strategy.amountPerInterval,
      }),
    );
    expect(mockMarkProposalExecuted).toHaveBeenCalledWith(
      'prop-1',
      expect.objectContaining({
        txHash: '0xtx123',
        status: 'confirmed',
      }),
    );
  });

  it('marks failed execution correctly', async () => {
    const strategy = makeStrategy({ autoExecute: true });
    mockGetAgentStrategies.mockResolvedValue([strategy]);
    mockCreateProposal.mockResolvedValue(makeProposal());
    mockExecuteSwap.mockResolvedValue({
      success: false,
      amountIn: strategy.amountPerInterval,
      amountOut: '0',
      error: 'Reverted',
    });

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockMarkProposalExecuted).toHaveBeenCalledWith(
      'prop-1',
      expect.objectContaining({ status: 'failed', txHash: '' }),
    );
  });

  it('skips paused strategies', async () => {
    mockGetAgentStrategies.mockResolvedValue([
      makeStrategy({ status: 'paused' }),
    ]);

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockGetQuote).not.toHaveBeenCalled();
    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

  it('executes approved proposals from previous cycles', async () => {
    mockGetAgentStrategies.mockResolvedValue([]);
    const approved = makeProposal({ id: 'prop-approved', status: 'approved' });
    mockGetApprovedProposals.mockResolvedValue([approved]);
    mockExecuteSwap.mockResolvedValue({
      success: true,
      txHash: '0xapproved-tx',
      amountIn: approved.amount,
      amountOut: '1000000',
    });

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockExecuteSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenIn: approved.tokenIn,
        tokenOut: approved.tokenOut,
        chainId: 480,
        amount: approved.amount,
      }),
    );
    expect(mockMarkProposalExecuted).toHaveBeenCalledWith(
      'prop-approved',
      expect.objectContaining({ txHash: '0xapproved-tx', status: 'confirmed' }),
    );
  });

  it('does not start duplicate loops', async () => {
    mockGetAgentStrategies.mockResolvedValue([]);

    const { startAgentLoop, isLoopActive } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);
    await startAgentLoop(AGENT_ID);

    expect(isLoopActive(AGENT_ID)).toBe(true);
    // getAgentStrategies called once (first start), not twice
    expect(mockGetAgentStrategies).toHaveBeenCalledTimes(1);
  });

  it('stops a running loop', async () => {
    mockGetAgentStrategies.mockResolvedValue([]);

    const { startAgentLoop, stopAgentLoop, isLoopActive } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);
    expect(isLoopActive(AGENT_ID)).toBe(true);

    await stopAgentLoop(AGENT_ID);
    expect(isLoopActive(AGENT_ID)).toBe(false);
  });

  it('stopAgentLoop is safe on unknown agentId', async () => {
    const { stopAgentLoop } = await import('../agent-runtime');
    await expect(stopAgentLoop('nonexistent')).resolves.toBeUndefined();
  });

  it('continues after a single strategy error', async () => {
    const good = makeStrategy({ id: 'strat-good', name: 'Good' });
    const bad = makeStrategy({ id: 'strat-bad', name: 'Bad' });

    mockGetAgentStrategies.mockResolvedValue([bad, good]);
    mockGetQuote
      .mockRejectedValueOnce(new Error('Quote failed'))
      .mockResolvedValueOnce({ quote: { quoteDecimals: '500' } });
    mockCreateProposal.mockResolvedValue(makeProposal());

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    // Good strategy still processed despite bad one failing
    expect(mockCreateProposal).toHaveBeenCalledTimes(1);
    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({ strategyId: 'strat-good' }),
    );
  });

  it('continues after a single approved proposal execution fails', async () => {
    mockGetAgentStrategies.mockResolvedValue([]);
    const p1 = makeProposal({ id: 'p1' });
    const p2 = makeProposal({ id: 'p2' });
    mockGetApprovedProposals.mockResolvedValue([p1, p2]);
    mockExecuteSwap
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        success: true,
        txHash: '0xok',
        amountIn: '1',
        amountOut: '1',
      });

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    // p2 still executed despite p1 failing
    expect(mockMarkProposalExecuted).toHaveBeenCalledTimes(1);
    expect(mockMarkProposalExecuted).toHaveBeenCalledWith(
      'p2',
      expect.objectContaining({ txHash: '0xok' }),
    );
  });
});
