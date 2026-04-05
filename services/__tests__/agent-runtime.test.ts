import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentStrategy, Proposal, EvaluatorAction } from '@/types';

const mockGetAgentStrategies = vi.fn();
const mockCreateProposal = vi.fn();
const mockGetRecentProposal = vi.fn();
const mockGetLastExecutionForStrategy = vi.fn();
const mockEvaluateStrategy = vi.fn();
const mockGetMarketSnapshot = vi.fn();
const mockGetTokenBalances = vi.fn();
const mockGetPortfolioSnapshot = vi.fn();
const mockGetPriceFromSnapshot = vi.fn();
const mockComputeUsdcValue = vi.fn();
const mockDbAgentFindUnique = vi.fn();
const mockDbAgentStrategyUpdate = vi.fn();

vi.mock('@/lib/agent-service', () => ({
  getAgentStrategies: (...args: unknown[]) => mockGetAgentStrategies(...args),
  createProposal: (...args: unknown[]) => mockCreateProposal(...args),
  getRecentProposal: (...args: unknown[]) => mockGetRecentProposal(...args),
  getLastExecutionForStrategy: (...args: unknown[]) => mockGetLastExecutionForStrategy(...args),
  updateProposalStatus: vi.fn(),
}));

vi.mock('../uniswap', () => ({}));

vi.mock('../strategy-evaluator', () => ({
  evaluateStrategy: (...args: unknown[]) => mockEvaluateStrategy(...args),
}));

vi.mock('../market-snapshot', () => ({
  getMarketSnapshot: (...args: unknown[]) => mockGetMarketSnapshot(...args),
  getPriceFromSnapshot: (...args: unknown[]) => mockGetPriceFromSnapshot(...args),
  computeUsdcValue: (...args: unknown[]) => mockComputeUsdcValue(...args),
}));

vi.mock('../portfolio', () => ({
  getTokenBalances: (...args: unknown[]) => mockGetTokenBalances(...args),
  getPortfolioSnapshot: (...args: unknown[]) => mockGetPortfolioSnapshot(...args),
}));

vi.mock('../wallet', () => ({
  getWalletAddress: () => '0x' + 'a'.repeat(40) as `0x${string}`,
}));

vi.mock('@/lib/db', () => ({
  db: {
    agent: { findUnique: (...args: unknown[]) => mockDbAgentFindUnique(...args) },
    agentStrategy: { update: (...args: unknown[]) => mockDbAgentStrategyUpdate(...args) },
  },
}));

const AGENT_ID = 'agent-123';
const AGENT_WALLET = '0x' + 'a'.repeat(40);

function makeStrategy(overrides: Partial<AgentStrategy> = {}): AgentStrategy {
  return {
    id: 'strat-1',
    agentId: AGENT_ID,
    name: 'Daily WETH\u2192USDC',
    tokenIn: '0x4200000000000000000000000000000000000006',
    tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
    chainId: 480,
    amountPerInterval: '500000000000000000',
    interval: 'daily',
    autoExecute: false,
    status: 'active',
    strategyType: 'dca',
    targetAllocationBps: null,
    rebalanceBandBps: null,
    maxSlippageBps: null,
    minNotionalUsd: null,
    cooldownMinutes: null,
    lastTriggeredAt: null,
    metadata: {},
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
    triggerType: null,
    triggerSummary: null,
    notionalUsd: null,
    expectedSlippageBps: null,
    marketSnapshot: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeAction(overrides: Partial<EvaluatorAction> = {}): EvaluatorAction {
  return {
    type: 'dca_buy',
    tokenIn: '0x4200000000000000000000000000000000000006',
    tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
    amount: '500000000000000000',
    estimatedOutput: '1000000',
    notionalUsd: '1500000000',
    triggerType: 'interval_due',
    triggerSummary: 'daily DCA interval reached',
    reasoning: 'DCA buy',
    marketSnapshot: { quotedAt: new Date().toISOString() },
    ...overrides,
  };
}

const defaultMarketSnapshot = { prices: [], fetchedAt: new Date().toISOString() };
const defaultPortfolio = {
  walletAddress: AGENT_WALLET,
  balances: [],
  totalUsdcValue: '0',
  allocations: {},
  fetchedAt: new Date().toISOString(),
};

describe('agent-runtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockDbAgentFindUnique.mockResolvedValue({ status: 'active', walletAddress: AGENT_WALLET });
    mockGetRecentProposal.mockResolvedValue(null);
    mockGetLastExecutionForStrategy.mockResolvedValue(null);
    mockDbAgentStrategyUpdate.mockResolvedValue(undefined);
    mockGetMarketSnapshot.mockResolvedValue(defaultMarketSnapshot);
    mockGetTokenBalances.mockResolvedValue(new Map());
    mockGetPortfolioSnapshot.mockResolvedValue(defaultPortfolio);
    mockGetPriceFromSnapshot.mockReturnValue(null);
    mockComputeUsdcValue.mockReturnValue(BigInt(0));

    delete process.env.DEMO_MODE;
  });

  afterEach(async () => {
    const { stopAgentLoop, _resetForTesting } = await import('../agent-runtime');
    await stopAgentLoop(AGENT_ID);
    _resetForTesting();
    vi.useRealTimers();
  });

  // ── Core proposal creation via evaluator ─────────────────────────────

  it('creates pending proposal when evaluator returns action', async () => {
    const strategy = makeStrategy();
    mockGetAgentStrategies.mockResolvedValue([strategy]);
    mockEvaluateStrategy.mockReturnValue(makeAction());
    mockCreateProposal.mockResolvedValue(makeProposal({ status: 'pending' }));

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockEvaluateStrategy).toHaveBeenCalled();
    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: AGENT_ID,
        strategyId: strategy.id,
        status: 'pending',
        type: 'dca_buy',
        triggerType: 'interval_due',
        triggerSummary: 'daily DCA interval reached',
      }),
    );
  });

  it('skips strategy when evaluator returns null', async () => {
    mockGetAgentStrategies.mockResolvedValue([makeStrategy()]);
    mockEvaluateStrategy.mockReturnValue(null);

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

  it('loads portfolio and market snapshot once per cycle', async () => {
    mockGetAgentStrategies.mockResolvedValue([makeStrategy(), makeStrategy({ id: 'strat-2' })]);
    mockEvaluateStrategy.mockReturnValue(null);

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockGetMarketSnapshot).toHaveBeenCalledTimes(1);
    expect(mockGetTokenBalances).toHaveBeenCalledTimes(1);
    expect(mockGetPortfolioSnapshot).toHaveBeenCalledTimes(1);
  });

  // ── Pause behavior ────────────────────────────────────────────────────

  it('skips paused strategies', async () => {
    mockGetAgentStrategies.mockResolvedValue([makeStrategy({ status: 'paused' })]);

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockEvaluateStrategy).not.toHaveBeenCalled();
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

  // ── Deduplication ─────────────────────────────────────────────────────

  it('does not create a proposal when a recent one already exists', async () => {
    const strategy = makeStrategy();
    mockGetAgentStrategies.mockResolvedValue([strategy]);
    mockGetRecentProposal.mockResolvedValue(makeProposal());

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockEvaluateStrategy).not.toHaveBeenCalled();
    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

  it('creates proposal when no recent proposal exists', async () => {
    const strategy = makeStrategy();
    mockGetAgentStrategies.mockResolvedValue([strategy]);
    mockGetRecentProposal.mockResolvedValue(null);
    mockEvaluateStrategy.mockReturnValue(makeAction());
    mockCreateProposal.mockResolvedValue(makeProposal({ status: 'pending' }));

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockCreateProposal).toHaveBeenCalledTimes(1);
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

  // ── Error resilience ──────────────────────────────────────────────────

  it('continues after a single strategy evaluator failure', async () => {
    const good = makeStrategy({ id: 'strat-good', name: 'Good' });
    const bad = makeStrategy({ id: 'strat-bad', name: 'Bad' });

    mockGetAgentStrategies.mockResolvedValue([bad, good]);
    mockGetRecentProposal.mockResolvedValue(null);
    mockGetLastExecutionForStrategy.mockResolvedValue(null);

    let callCount = 0;
    mockEvaluateStrategy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('Evaluator failed');
      return makeAction();
    });
    mockCreateProposal.mockResolvedValue(makeProposal());

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockCreateProposal).toHaveBeenCalledTimes(1);
  });

  // ── Structured metadata flows through ────────────────────────────────

  it('passes structured metadata from evaluator to proposal', async () => {
    const strategy = makeStrategy();
    mockGetAgentStrategies.mockResolvedValue([strategy]);
    mockEvaluateStrategy.mockReturnValue(makeAction({
      triggerType: 'interval_due',
      triggerSummary: 'daily DCA',
      notionalUsd: '3000000000',
      marketSnapshot: { currentAllocationBps: 5000 },
    }));
    mockCreateProposal.mockResolvedValue(makeProposal({ status: 'pending' }));

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerType: 'interval_due',
        triggerSummary: 'daily DCA',
        notionalUsd: '3000000000',
        marketSnapshot: { currentAllocationBps: 5000 },
      }),
    );
  });

  it('updates lastTriggeredAt when evaluator returns action', async () => {
    const strategy = makeStrategy();
    mockGetAgentStrategies.mockResolvedValue([strategy]);
    mockEvaluateStrategy.mockReturnValue(makeAction());
    mockCreateProposal.mockResolvedValue(makeProposal({ status: 'pending' }));

    const { startAgentLoop } = await import('../agent-runtime');
    await startAgentLoop(AGENT_ID);

    expect(mockDbAgentStrategyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: strategy.id },
        data: expect.objectContaining({ lastTriggeredAt: expect.any(Date) }),
      }),
    );
  });
});
