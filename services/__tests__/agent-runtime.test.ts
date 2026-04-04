import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentStrategy, Proposal } from '@/types';

const mockGetAgentStrategies = vi.fn();
const mockCreateProposal = vi.fn();
const mockGetApprovedProposals = vi.fn();
const mockMarkProposalExecuted = vi.fn();
const mockGetRecentProposal = vi.fn();
const mockGetQuote = vi.fn();
const mockExecuteSwap = vi.fn();
const mockDbExecutionFindFirst = vi.fn();
const mockDbProposalUpdate = vi.fn();
const mockDbAgentFindUnique = vi.fn();

vi.mock('@/lib/agent-service', () => ({
  getAgentStrategies: (...args: unknown[]) => mockGetAgentStrategies(...args),
  createProposal: (...args: unknown[]) => mockCreateProposal(...args),
  getApprovedProposals: (...args: unknown[]) => mockGetApprovedProposals(...args),
  markProposalExecuted: (...args: unknown[]) => mockMarkProposalExecuted(...args),
  getRecentProposal: (...args: unknown[]) => mockGetRecentProposal(...args),
}));

vi.mock('../uniswap', () => ({
  getQuote: (...args: unknown[]) => mockGetQuote(...args),
  executeSwap: (...args: unknown[]) => mockExecuteSwap(...args),
}));

vi.mock('@/lib/db', () => ({
  db: {
    execution: { findFirst: (...args: unknown[]) => mockDbExecutionFindFirst(...args) },
    proposal: { update: (...args: unknown[]) => mockDbProposalUpdate(...args) },
    agent: { findUnique: (...args: unknown[]) => mockDbAgentFindUnique(...args) },
  },
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
    mockGetRecentProposal.mockReset();
    mockGetQuote.mockReset();
    mockExecuteSwap.mockReset();
    mockDbExecutionFindFirst.mockReset();
    mockDbProposalUpdate.mockReset();
    mockDbAgentFindUnique.mockReset();

    // Defaults: agent is active, no recent proposals, no approved proposals
    mockDbAgentFindUnique.mockResolvedValue({ status: 'active' });
    mockGetApprovedProposals.mockResolvedValue([]);
    mockGetRecentProposal.mockResolvedValue(null);
    mockGetQuote.mockResolvedValue({
      quote: { quoteDecimals: '1000000' },
      gasEstimate: '150000',
    });
    mockDbExecutionFindFirst.mockResolvedValue(null);
    mockDbProposalUpdate.mockResolvedValue(undefined);

    delete process.env.DEMO_MODE;
  });

  afterEach(async () => {
    const { stopAgentLoop, _resetForTesting } = await import('../agent-runtime');
    stopAgentLoop(AGENT_ID);
    _resetForTesting();
    vi.useRealTimers();
  });

  // ── Core proposal creation ────────────────────────────────────────────

  it('creates pending proposal for non-autoExecute strategy', async () => {
    const strategy = makeStrategy({ autoExecute: false });
    mockGetAgentStrategies.mockResolvedValue([strategy]);
    mockCreateProposal.mockResolvedValue(makeProposal({ status: 'pending' }));
    mockGetQuote.mockResolvedValue({
      quote: { quote: '925000000', quoteDecimals: '925' },
      gasEstimate: '150000',
    });

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: AGENT_ID,
        strategyId: strategy.id,
        status: 'pending',
        type: 'dca_buy',
        estimatedOutput: '925000000',
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

  // ── Pause behavior ────────────────────────────────────────────────────

  it('skips paused strategies', async () => {
    mockGetAgentStrategies.mockResolvedValue([
      makeStrategy({ status: 'paused' }),
    ]);

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockGetQuote).not.toHaveBeenCalled();
    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

  it('skips entire cycle when agent is paused and stops loop', async () => {
    mockDbAgentFindUnique.mockResolvedValue({ status: 'paused' });
    mockGetAgentStrategies.mockResolvedValue([makeStrategy()]);

    const { startAgentLoop, isLoopActive } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockGetAgentStrategies).not.toHaveBeenCalled();
    expect(mockCreateProposal).not.toHaveBeenCalled();
    expect(isLoopActive(AGENT_ID)).toBe(false);
  });

  it('skips cycle when agent is not found in DB', async () => {
    mockDbAgentFindUnique.mockResolvedValue(null);

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockGetAgentStrategies).not.toHaveBeenCalled();
  });

  it('skips cycle when agent is still registering', async () => {
    mockDbAgentFindUnique.mockResolvedValue({ status: 'registering' });

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockGetAgentStrategies).not.toHaveBeenCalled();
  });

  // ── Approved proposal execution ───────────────────────────────────────

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

    expect(mockMarkProposalExecuted).toHaveBeenCalledWith(
      'prop-approved',
      expect.objectContaining({ txHash: '0xapproved-tx', status: 'confirmed' }),
    );
  });

  // ── Duplicate prevention ──────────────────────────────────────────────

  it('skips proposal creation when recent proposal exists for strategy', async () => {
    const strategy = makeStrategy();
    mockGetAgentStrategies.mockResolvedValue([strategy]);
    mockGetRecentProposal.mockResolvedValue(makeProposal({ status: 'pending' }));

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockGetQuote).not.toHaveBeenCalled();
    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

  it('creates proposal when no recent proposal exists', async () => {
    const strategy = makeStrategy();
    mockGetAgentStrategies.mockResolvedValue([strategy]);
    mockGetRecentProposal.mockResolvedValue(null);
    mockCreateProposal.mockResolvedValue(makeProposal({ status: 'pending' }));

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockCreateProposal).toHaveBeenCalledTimes(1);
  });

  // ── Concurrent execution guard ────────────────────────────────────────

  it('skips proposal already being executed concurrently', async () => {
    mockGetAgentStrategies.mockResolvedValue([]);
    const proposal = makeProposal({ id: 'concurrent-prop' });
    mockGetApprovedProposals.mockResolvedValue([proposal]);

    const { startAgentLoop, executingProposals } = await import('../agent-runtime');
    executingProposals.add('concurrent-prop');

    await startAgentLoop(AGENT_ID);

    expect(mockExecuteSwap).not.toHaveBeenCalled();
    // Clean up
    executingProposals.delete('concurrent-prop');
  });

  it('removes proposal from executing set after completion', async () => {
    mockGetAgentStrategies.mockResolvedValue([]);
    const proposal = makeProposal({ id: 'done-prop' });
    mockGetApprovedProposals.mockResolvedValue([proposal]);
    mockExecuteSwap.mockResolvedValue({
      success: true,
      txHash: '0xdone',
      amountIn: '1',
      amountOut: '1',
    });

    const { startAgentLoop, executingProposals } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(executingProposals.has('done-prop')).toBe(false);
  });

  it('removes proposal from executing set even on failure', async () => {
    mockGetAgentStrategies.mockResolvedValue([]);
    const proposal = makeProposal({ id: 'fail-prop' });
    mockGetApprovedProposals.mockResolvedValue([proposal]);
    mockExecuteSwap.mockRejectedValue(new Error('Boom'));

    const { startAgentLoop, executingProposals } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(executingProposals.has('fail-prop')).toBe(false);
  });

  // ── Loop management ───────────────────────────────────────────────────

  it('does not start duplicate loops', async () => {
    mockGetAgentStrategies.mockResolvedValue([]);

    const { startAgentLoop, isLoopActive } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);
    await startAgentLoop(AGENT_ID);

    expect(isLoopActive(AGENT_ID)).toBe(true);
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

  // ── Resilience ────────────────────────────────────────────────────────

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

    expect(mockMarkProposalExecuted).toHaveBeenCalledTimes(1);
    expect(mockMarkProposalExecuted).toHaveBeenCalledWith(
      'p2',
      expect.objectContaining({ txHash: '0xok' }),
    );
  });

  // ── Interval scheduling ───────────────────────────────────────────────

  describe('shouldExecuteNow (interval scheduling)', () => {
    it('executes when no prior execution exists', async () => {
      mockDbExecutionFindFirst.mockResolvedValue(null);
      const strategy = makeStrategy({ interval: 'daily' });
      mockGetAgentStrategies.mockResolvedValue([strategy]);
      mockCreateProposal.mockResolvedValue(makeProposal({ status: 'pending' }));

      const { startAgentLoop } = await import('../agent-runtime');
      await startAgentLoop(AGENT_ID);

      expect(mockCreateProposal).toHaveBeenCalledTimes(1);
    });

    it('skips strategy when last execution is within interval', async () => {
      mockDbExecutionFindFirst.mockResolvedValue({
        executedAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      const strategy = makeStrategy({ interval: 'daily' });
      mockGetAgentStrategies.mockResolvedValue([strategy]);

      const { startAgentLoop } = await import('../agent-runtime');
      await startAgentLoop(AGENT_ID);

      expect(mockCreateProposal).not.toHaveBeenCalled();
    });

    it('executes when last execution exceeds interval', async () => {
      mockDbExecutionFindFirst.mockResolvedValue({
        executedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      const strategy = makeStrategy({ interval: 'daily' });
      mockGetAgentStrategies.mockResolvedValue([strategy]);
      mockCreateProposal.mockResolvedValue(makeProposal({ status: 'pending' }));

      const { startAgentLoop } = await import('../agent-runtime');
      await startAgentLoop(AGENT_ID);

      expect(mockCreateProposal).toHaveBeenCalledTimes(1);
    });

    it('respects hourly interval', async () => {
      mockDbExecutionFindFirst.mockResolvedValue({
        executedAt: new Date(Date.now() - 30 * 60 * 1000),
      });
      const strategy = makeStrategy({ interval: 'hourly' });
      mockGetAgentStrategies.mockResolvedValue([strategy]);

      const { startAgentLoop } = await import('../agent-runtime');
      await startAgentLoop(AGENT_ID);

      expect(mockCreateProposal).not.toHaveBeenCalled();
    });

    it('respects weekly interval', async () => {
      mockDbExecutionFindFirst.mockResolvedValue({
        executedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      });
      const strategy = makeStrategy({ interval: 'weekly' });
      mockGetAgentStrategies.mockResolvedValue([strategy]);

      const { startAgentLoop } = await import('../agent-runtime');
      await startAgentLoop(AGENT_ID);

      expect(mockCreateProposal).not.toHaveBeenCalled();
    });

    it('always executes when DEMO_MODE=true regardless of interval', async () => {
      process.env.DEMO_MODE = 'true';
      mockDbExecutionFindFirst.mockResolvedValue({
        executedAt: new Date(Date.now() - 1000),
      });
      const strategy = makeStrategy({ interval: 'daily' });
      mockGetAgentStrategies.mockResolvedValue([strategy]);
      mockCreateProposal.mockResolvedValue(makeProposal({ status: 'pending' }));

      const { startAgentLoop } = await import('../agent-runtime');
      await startAgentLoop(AGENT_ID);

      expect(mockCreateProposal).toHaveBeenCalledTimes(1);
    });

    it('queries last execution with correct strategyId', async () => {
      const strategy = makeStrategy({ id: 'strat-xyz', interval: 'hourly' });
      mockGetAgentStrategies.mockResolvedValue([strategy]);
      mockDbExecutionFindFirst.mockResolvedValue(null);
      mockCreateProposal.mockResolvedValue(makeProposal({ status: 'pending' }));

      const { startAgentLoop } = await import('../agent-runtime');
      await startAgentLoop(AGENT_ID);

      expect(mockDbExecutionFindFirst).toHaveBeenCalledWith({
        where: { strategyId: 'strat-xyz' },
        orderBy: { executedAt: 'desc' },
        select: { executedAt: true },
      });
    });
  });

  // ── Error recovery (auto-execute) ────────────────────────────────────

  describe('auto-execute error recovery', () => {
    it('reverts proposal to pending when auto-execute swap fails', async () => {
      const strategy = makeStrategy({ autoExecute: true });
      mockGetAgentStrategies.mockResolvedValue([strategy]);
      mockCreateProposal.mockResolvedValue(makeProposal({ id: 'prop-fail', status: 'approved' }));
      mockExecuteSwap.mockResolvedValue({
        success: false,
        amountIn: strategy.amountPerInterval,
        amountOut: '0',
        error: 'Reverted',
      });

      const { startAgentLoop } = await import('../agent-runtime');
      await startAgentLoop(AGENT_ID);

      expect(mockDbProposalUpdate).toHaveBeenCalledWith({
        where: { id: 'prop-fail' },
        data: { status: 'pending' },
      });
      expect(mockMarkProposalExecuted).not.toHaveBeenCalled();
    });

    it('does not revert proposal when auto-execute succeeds', async () => {
      const strategy = makeStrategy({ autoExecute: true });
      mockGetAgentStrategies.mockResolvedValue([strategy]);
      mockCreateProposal.mockResolvedValue(makeProposal({ status: 'approved' }));
      mockExecuteSwap.mockResolvedValue({
        success: true,
        txHash: '0xok',
        amountIn: strategy.amountPerInterval,
        amountOut: '1000000',
      });

      const { startAgentLoop } = await import('../agent-runtime');
      await startAgentLoop(AGENT_ID);

      expect(mockDbProposalUpdate).not.toHaveBeenCalled();
      expect(mockMarkProposalExecuted).toHaveBeenCalled();
    });
  });

  // ── Retry logic (approved proposals) ─────────────────────────────────

  describe('proposal retry counter', () => {
    it('increments retry count on execution failure', async () => {
      mockGetAgentStrategies.mockResolvedValue([]);
      const proposal = makeProposal({ id: 'retry-prop' });
      mockGetApprovedProposals.mockResolvedValue([proposal]);
      mockExecuteSwap.mockResolvedValue({
        success: false,
        amountIn: '1',
        amountOut: '0',
        error: 'Reverted',
      });

      const { startAgentLoop, proposalRetries } = await import('../agent-runtime');
      await startAgentLoop(AGENT_ID);

      expect(proposalRetries.get('retry-prop')).toBe(1);
      expect(mockMarkProposalExecuted).not.toHaveBeenCalled();
    });

    it('increments retry count on thrown error', async () => {
      mockGetAgentStrategies.mockResolvedValue([]);
      const proposal = makeProposal({ id: 'throw-prop' });
      mockGetApprovedProposals.mockResolvedValue([proposal]);
      mockExecuteSwap.mockRejectedValue(new Error('Network down'));

      const { startAgentLoop, proposalRetries } = await import('../agent-runtime');
      await startAgentLoop(AGENT_ID);

      expect(proposalRetries.get('throw-prop')).toBe(1);
    });

    it('skips proposal after MAX_PROPOSAL_RETRIES exhausted', async () => {
      mockGetAgentStrategies.mockResolvedValue([]);
      const proposal = makeProposal({ id: 'exhausted-prop' });
      mockGetApprovedProposals.mockResolvedValue([proposal]);

      const { startAgentLoop, proposalRetries, MAX_PROPOSAL_RETRIES } = await import('../agent-runtime');
      proposalRetries.set('exhausted-prop', MAX_PROPOSAL_RETRIES);

      await startAgentLoop(AGENT_ID);

      expect(mockExecuteSwap).not.toHaveBeenCalled();
      expect(mockMarkProposalExecuted).not.toHaveBeenCalled();
    });

    it('clears retry counter on successful execution', async () => {
      mockGetAgentStrategies.mockResolvedValue([]);
      const proposal = makeProposal({ id: 'success-prop' });
      mockGetApprovedProposals.mockResolvedValue([proposal]);
      mockExecuteSwap.mockResolvedValue({
        success: true,
        txHash: '0xwin',
        amountIn: '1',
        amountOut: '1',
      });

      const { startAgentLoop, proposalRetries } = await import('../agent-runtime');
      proposalRetries.set('success-prop', 2);

      await startAgentLoop(AGENT_ID);

      expect(proposalRetries.has('success-prop')).toBe(false);
      expect(mockMarkProposalExecuted).toHaveBeenCalled();
    });

    it('retries up to MAX_PROPOSAL_RETRIES then stops', async () => {
      mockGetAgentStrategies.mockResolvedValue([]);
      const proposal = makeProposal({ id: 'multi-retry' });

      const { startAgentLoop, stopAgentLoop, proposalRetries, MAX_PROPOSAL_RETRIES } =
        await import('../agent-runtime');

      mockExecuteSwap.mockResolvedValue({
        success: false,
        amountIn: '1',
        amountOut: '0',
        error: 'Reverted',
      });

      for (let i = 0; i < MAX_PROPOSAL_RETRIES + 1; i++) {
        mockGetApprovedProposals.mockResolvedValue([proposal]);
        mockGetAgentStrategies.mockResolvedValue([]);
        await stopAgentLoop(AGENT_ID);
        await startAgentLoop(AGENT_ID);
      }

      expect(mockExecuteSwap).toHaveBeenCalledTimes(MAX_PROPOSAL_RETRIES);
      expect(proposalRetries.get('multi-retry')).toBe(MAX_PROPOSAL_RETRIES);
    });
  });
});
