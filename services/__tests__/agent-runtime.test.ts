import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentStrategy, Proposal } from '@/types';

const mockGetAgentStrategies = vi.fn();
const mockCreateProposal = vi.fn();
const mockGetRecentProposal = vi.fn();
const mockGetQuote = vi.fn();
const mockDbExecutionFindFirst = vi.fn();
const mockDbAgentFindUnique = vi.fn();

vi.mock('@/lib/agent-service', () => ({
  getAgentStrategies: (...args: unknown[]) => mockGetAgentStrategies(...args),
  createProposal: (...args: unknown[]) => mockCreateProposal(...args),
  getRecentProposal: (...args: unknown[]) => mockGetRecentProposal(...args),
}));

vi.mock('../uniswap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../uniswap')>();
  return {
    ...actual,
    getQuote: (...args: unknown[]) => mockGetQuote(...args),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    execution: { findFirst: (...args: unknown[]) => mockDbExecutionFindFirst(...args) },
    agent: { findUnique: (...args: unknown[]) => mockDbAgentFindUnique(...args) },
  },
}));

const AGENT_ID = 'agent-123';
const AGENT_WALLET = '0x1111111111111111111111111111111111111111';

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
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('agent-runtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetAgentStrategies.mockReset();
    mockCreateProposal.mockReset();
    mockGetRecentProposal.mockReset();
    mockGetQuote.mockReset();
    mockDbExecutionFindFirst.mockReset();
    mockDbAgentFindUnique.mockReset();

    mockDbAgentFindUnique.mockResolvedValue({ status: 'active', walletAddress: AGENT_WALLET });
    mockGetRecentProposal.mockResolvedValue(null);
    mockGetQuote.mockResolvedValue({
      quote: { quote: '925000000', quoteDecimals: '925' },
      gasEstimate: '150000',
    });
    mockDbExecutionFindFirst.mockResolvedValue(null);

    delete process.env.DEMO_MODE;
  });

  afterEach(async () => {
    const { stopAgentLoop, _resetForTesting } = await import('../agent-runtime');
    await stopAgentLoop(AGENT_ID);
    _resetForTesting();
    vi.useRealTimers();
  });

  it('creates a pending proposal for a standard strategy using the agent wallet as swapper', async () => {
    const strategy = makeStrategy();
    mockGetAgentStrategies.mockResolvedValue([strategy]);
    mockCreateProposal.mockResolvedValue(makeProposal());

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockGetQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenIn: strategy.tokenIn,
        tokenOut: strategy.tokenOut,
        chainId: 480,
        amount: strategy.amountPerInterval,
      }),
      { swapper: AGENT_WALLET },
    );
    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: AGENT_ID,
        strategyId: strategy.id,
        status: 'pending',
        estimatedOutput: '925000000',
        reasoning: `DCA: ${strategy.name} — awaiting approval`,
      }),
    );
  });

  it('keeps auto-execute strategies approval-based and does not execute swaps server-side', async () => {
    const strategy = makeStrategy({ autoExecute: true });
    mockGetAgentStrategies.mockResolvedValue([strategy]);
    mockCreateProposal.mockResolvedValue(makeProposal());

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        reasoning: `Auto-execute requested for ${strategy.name}, but World Wallet execution still requires confirmation`,
      }),
    );
  });

  it('skips paused strategies', async () => {
    mockGetAgentStrategies.mockResolvedValue([makeStrategy({ status: 'paused' })]);

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockGetQuote).not.toHaveBeenCalled();
    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

  it('skips the cycle when the agent is paused and stops the loop', async () => {
    mockDbAgentFindUnique.mockResolvedValue({ status: 'paused', walletAddress: AGENT_WALLET });
    mockGetAgentStrategies.mockResolvedValue([makeStrategy()]);

    const { startAgentLoop, isLoopActive } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockGetAgentStrategies).not.toHaveBeenCalled();
    expect(isLoopActive(AGENT_ID)).toBe(false);
  });

  it('skips the cycle when the agent is missing', async () => {
    mockDbAgentFindUnique.mockResolvedValue(null);

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockGetAgentStrategies).not.toHaveBeenCalled();
  });

  it('does not create a proposal when a recent one already exists', async () => {
    const strategy = makeStrategy();
    mockGetAgentStrategies.mockResolvedValue([strategy]);
    mockGetRecentProposal.mockResolvedValue(makeProposal());

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockGetQuote).not.toHaveBeenCalled();
    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

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

  it('continues after a single strategy quote failure', async () => {
    const good = makeStrategy({ id: 'strat-good', name: 'Good' });
    const bad = makeStrategy({ id: 'strat-bad', name: 'Bad' });

    mockGetAgentStrategies.mockResolvedValue([bad, good]);
    mockGetQuote
      .mockRejectedValueOnce(new Error('Quote failed'))
      .mockResolvedValueOnce({ quote: { quote: '500000000', quoteDecimals: '500' } });
    mockCreateProposal.mockResolvedValue(makeProposal());

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockCreateProposal).toHaveBeenCalledTimes(1);
    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({ strategyId: 'strat-good' }),
    );
  });

  it('skips strategy execution when the interval has not elapsed', async () => {
    mockDbExecutionFindFirst.mockResolvedValue({
      executedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    mockGetAgentStrategies.mockResolvedValue([makeStrategy({ interval: 'daily' })]);

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

  it('ignores interval gating in demo mode', async () => {
    process.env.DEMO_MODE = 'true';
    mockDbExecutionFindFirst.mockResolvedValue({
      executedAt: new Date(Date.now() - 1_000),
    });
    mockGetAgentStrategies.mockResolvedValue([makeStrategy({ interval: 'daily' })]);
    mockCreateProposal.mockResolvedValue(makeProposal());

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockCreateProposal).toHaveBeenCalledTimes(1);
  });
});
