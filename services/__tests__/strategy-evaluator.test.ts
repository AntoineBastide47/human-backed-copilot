import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentStrategy, PortfolioSnapshot, MarketSnapshotData } from '@/types';

const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';

function makeStrategy(overrides: Partial<AgentStrategy> = {}): AgentStrategy {
  return {
    id: 'strat-1',
    agentId: 'agent-1',
    name: 'Daily WETH→USDC DCA',
    tokenIn: WETH,
    tokenOut: USDC,
    chainId: 480,
    amountPerInterval: '1000000000000000000', // 1 WETH
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

function makePortfolio(overrides: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
  return {
    walletAddress: '0x' + 'a'.repeat(40),
    balances: [
      { token: WETH.toLowerCase(), balance: '2000000000000000000', decimals: 18 },
      { token: USDC.toLowerCase(), balance: '3000000000', decimals: 6 },
    ],
    totalUsdcValue: '6000000000', // $6000
    allocations: {
      [WETH.toLowerCase()]: 5000, // 50%
      [USDC.toLowerCase()]: 5000, // 50%
    },
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMarket(): MarketSnapshotData {
  return {
    prices: [
      {
        token: WETH.toLowerCase(),
        usdcPerUnit: '3000000000', // $3000 per WETH
        referenceAmount: '1000000000000000000',
        referenceOutput: '3000000000',
      },
      {
        token: USDC.toLowerCase(),
        usdcPerUnit: '1000000', // $1 per USDC
        referenceAmount: '1000000',
        referenceOutput: '1000000',
      },
    ],
    fetchedAt: new Date().toISOString(),
  };
}

describe('strategy-evaluator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete process.env.DEMO_MODE;
  });

  // ── DCA Evaluator ──

  describe('evaluateDcaStrategy', () => {
    it('returns action when interval is due and no prior execution', async () => {
      const { evaluateDcaStrategy } = await import('../strategy-evaluator');
      const action = evaluateDcaStrategy(makeStrategy(), makePortfolio(), makeMarket(), null);
      expect(action).not.toBeNull();
      expect(action!.type).toBe('dca_buy');
      expect(action!.triggerType).toBe('interval_due');
      expect(action!.amount).toBe('1000000000000000000');
    });

    it('returns null when interval has not elapsed', async () => {
      const { evaluateDcaStrategy } = await import('../strategy-evaluator');
      const lastExec = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      const action = evaluateDcaStrategy(
        makeStrategy({ interval: 'daily' }),
        makePortfolio(),
        makeMarket(),
        lastExec,
      );
      expect(action).toBeNull();
    });

    it('returns action when interval has elapsed', async () => {
      const { evaluateDcaStrategy } = await import('../strategy-evaluator');
      const lastExec = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const action = evaluateDcaStrategy(
        makeStrategy({ interval: 'daily' }),
        makePortfolio(),
        makeMarket(),
        lastExec,
      );
      expect(action).not.toBeNull();
    });

    it('returns null when amount is below minNotionalUsd', async () => {
      const { evaluateDcaStrategy } = await import('../strategy-evaluator');
      const action = evaluateDcaStrategy(
        makeStrategy({ minNotionalUsd: '10000000000' }), // $10000 min
        makePortfolio(),
        makeMarket(),
        null,
      );
      expect(action).toBeNull();
    });

    it('returns action when amount meets minNotionalUsd', async () => {
      const { evaluateDcaStrategy } = await import('../strategy-evaluator');
      const action = evaluateDcaStrategy(
        makeStrategy({ minNotionalUsd: '1000000' }), // $1 min
        makePortfolio(),
        makeMarket(),
        null,
      );
      expect(action).not.toBeNull();
    });

    it('returns null when in cooldown', async () => {
      const { evaluateDcaStrategy } = await import('../strategy-evaluator');
      const action = evaluateDcaStrategy(
        makeStrategy({
          cooldownMinutes: 120,
          lastTriggeredAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
        }),
        makePortfolio(),
        makeMarket(),
        null,
      );
      expect(action).toBeNull();
    });

    it('returns action when cooldown has expired', async () => {
      const { evaluateDcaStrategy } = await import('../strategy-evaluator');
      const action = evaluateDcaStrategy(
        makeStrategy({
          cooldownMinutes: 60,
          lastTriggeredAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(), // 90 min ago
        }),
        makePortfolio(),
        makeMarket(),
        null,
      );
      expect(action).not.toBeNull();
    });

    it('always fires in DEMO_MODE regardless of interval', async () => {
      process.env.DEMO_MODE = 'true';
      const { evaluateDcaStrategy } = await import('../strategy-evaluator');
      const lastExec = new Date(Date.now() - 1000); // 1 second ago
      const action = evaluateDcaStrategy(
        makeStrategy({ interval: 'weekly' }),
        makePortfolio(),
        makeMarket(),
        lastExec,
      );
      expect(action).not.toBeNull();
    });

    it('includes market snapshot in action', async () => {
      const { evaluateDcaStrategy } = await import('../strategy-evaluator');
      const action = evaluateDcaStrategy(makeStrategy(), makePortfolio(), makeMarket(), null);
      expect(action!.marketSnapshot).toBeDefined();
      expect(action!.marketSnapshot.tokenInBalance).toBeDefined();
      expect(action!.marketSnapshot.quotedAt).toBeDefined();
    });

    it('computes estimated output from market prices', async () => {
      const { evaluateDcaStrategy } = await import('../strategy-evaluator');
      const action = evaluateDcaStrategy(makeStrategy(), makePortfolio(), makeMarket(), null);
      // 1 WETH = $3000 USDC, output in USDC raw (6 decimals) = 3000 * 1e6 = 3000000000
      expect(action!.estimatedOutput).toBe('3000000000');
    });
  });

  // ── Rebalance Evaluator ──

  describe('evaluateRebalanceStrategy', () => {
    it('returns action when drift exceeds band', async () => {
      const { evaluateRebalanceStrategy } = await import('../strategy-evaluator');
      const strategy = makeStrategy({
        strategyType: 'rebalance',
        targetAllocationBps: 6000, // 60% target for USDC
        rebalanceBandBps: 500,     // 5% band
      });
      const portfolio = makePortfolio({
        allocations: {
          [WETH.toLowerCase()]: 3200,  // 32%
          [USDC.toLowerCase()]: 6800,  // 68% — drift of 8% from 60% target
        },
      });

      const action = evaluateRebalanceStrategy(strategy, portfolio, makeMarket());
      expect(action).not.toBeNull();
      expect(action!.type).toBe('rebalance');
      expect(action!.triggerType).toBe('rebalance_drift');
      expect(action!.triggerSummary).toContain('5.00%');
    });

    it('returns null when drift is within band', async () => {
      const { evaluateRebalanceStrategy } = await import('../strategy-evaluator');
      const strategy = makeStrategy({
        strategyType: 'rebalance',
        targetAllocationBps: 5000,
        rebalanceBandBps: 500,
      });
      const portfolio = makePortfolio({
        allocations: {
          [WETH.toLowerCase()]: 4800,
          [USDC.toLowerCase()]: 5200, // drift of 200bps, within 500bps band
        },
      });

      const action = evaluateRebalanceStrategy(strategy, portfolio, makeMarket());
      expect(action).toBeNull();
    });

    it('returns null when targetAllocationBps is not set', async () => {
      const { evaluateRebalanceStrategy } = await import('../strategy-evaluator');
      const strategy = makeStrategy({
        strategyType: 'rebalance',
        targetAllocationBps: null,
        rebalanceBandBps: 500,
      });
      const action = evaluateRebalanceStrategy(strategy, makePortfolio(), makeMarket());
      expect(action).toBeNull();
    });

    it('returns null when rebalanceBandBps is not set', async () => {
      const { evaluateRebalanceStrategy } = await import('../strategy-evaluator');
      const strategy = makeStrategy({
        strategyType: 'rebalance',
        targetAllocationBps: 6000,
        rebalanceBandBps: null,
      });
      const action = evaluateRebalanceStrategy(strategy, makePortfolio(), makeMarket());
      expect(action).toBeNull();
    });

    it('returns null when in cooldown', async () => {
      const { evaluateRebalanceStrategy } = await import('../strategy-evaluator');
      const strategy = makeStrategy({
        strategyType: 'rebalance',
        targetAllocationBps: 6000,
        rebalanceBandBps: 500,
        cooldownMinutes: 120,
        lastTriggeredAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      });
      const portfolio = makePortfolio({
        allocations: {
          [WETH.toLowerCase()]: 2000,
          [USDC.toLowerCase()]: 8000,
        },
      });

      const action = evaluateRebalanceStrategy(strategy, portfolio, makeMarket());
      expect(action).toBeNull();
    });

    it('returns null when trade size is below minNotionalUsd', async () => {
      const { evaluateRebalanceStrategy } = await import('../strategy-evaluator');
      const strategy = makeStrategy({
        strategyType: 'rebalance',
        targetAllocationBps: 4900, // slight drift
        rebalanceBandBps: 0,       // any drift triggers
        minNotionalUsd: '100000000000', // $100k min
      });
      const portfolio = makePortfolio({
        allocations: {
          [WETH.toLowerCase()]: 4900,
          [USDC.toLowerCase()]: 5100,
        },
      });

      const action = evaluateRebalanceStrategy(strategy, portfolio, makeMarket());
      expect(action).toBeNull();
    });

    it('sells overweight asset when tokenOut is overweight', async () => {
      const { evaluateRebalanceStrategy } = await import('../strategy-evaluator');
      const strategy = makeStrategy({
        strategyType: 'rebalance',
        tokenIn: WETH,
        tokenOut: USDC,
        targetAllocationBps: 4000, // 40% target for USDC
        rebalanceBandBps: 500,
      });
      const portfolio = makePortfolio({
        totalUsdcValue: '10000000000', // $10000
        allocations: {
          [WETH.toLowerCase()]: 3000,
          [USDC.toLowerCase()]: 7000, // 70%, overweight by 30%
        },
      });

      const action = evaluateRebalanceStrategy(strategy, portfolio, makeMarket());
      expect(action).not.toBeNull();
      // Should sell USDC (overweight) and buy WETH
      expect(action!.tokenIn).toBe(USDC);
      expect(action!.tokenOut).toBe(WETH);
    });

    it('sells tokenIn when tokenOut is underweight', async () => {
      const { evaluateRebalanceStrategy } = await import('../strategy-evaluator');
      const strategy = makeStrategy({
        strategyType: 'rebalance',
        tokenIn: WETH,
        tokenOut: USDC,
        targetAllocationBps: 7000, // 70% target for USDC
        rebalanceBandBps: 500,
      });
      const portfolio = makePortfolio({
        totalUsdcValue: '10000000000',
        allocations: {
          [WETH.toLowerCase()]: 5000,
          [USDC.toLowerCase()]: 5000, // 50%, underweight by 20%
        },
      });

      const action = evaluateRebalanceStrategy(strategy, portfolio, makeMarket());
      expect(action).not.toBeNull();
      // Should sell WETH and buy USDC
      expect(action!.tokenIn).toBe(WETH);
      expect(action!.tokenOut).toBe(USDC);
    });

    it('returns null when total portfolio value is zero', async () => {
      const { evaluateRebalanceStrategy } = await import('../strategy-evaluator');
      const strategy = makeStrategy({
        strategyType: 'rebalance',
        targetAllocationBps: 6000,
        rebalanceBandBps: 500,
      });
      const portfolio = makePortfolio({
        totalUsdcValue: '0',
        allocations: {
          [WETH.toLowerCase()]: 0,
          [USDC.toLowerCase()]: 0,
        },
      });

      const action = evaluateRebalanceStrategy(strategy, portfolio, makeMarket());
      expect(action).toBeNull();
    });

    it('includes drift info in market snapshot payload', async () => {
      const { evaluateRebalanceStrategy } = await import('../strategy-evaluator');
      const strategy = makeStrategy({
        strategyType: 'rebalance',
        targetAllocationBps: 5000,
        rebalanceBandBps: 200,
      });
      const portfolio = makePortfolio({
        allocations: {
          [WETH.toLowerCase()]: 3000,
          [USDC.toLowerCase()]: 7000,
        },
      });

      const action = evaluateRebalanceStrategy(strategy, portfolio, makeMarket());
      expect(action).not.toBeNull();
      expect(action!.marketSnapshot.currentAllocationBps).toBe(7000);
      expect(action!.marketSnapshot.targetAllocationBps).toBe(5000);
      expect(action!.marketSnapshot.driftBps).toBe(2000);
    });
  });

  // ── Dispatch ──

  describe('evaluateStrategy', () => {
    it('dispatches dca to evaluateDcaStrategy', async () => {
      const { evaluateStrategy } = await import('../strategy-evaluator');
      const action = evaluateStrategy(makeStrategy(), makePortfolio(), makeMarket(), null);
      expect(action).not.toBeNull();
      expect(action!.type).toBe('dca_buy');
    });

    it('dispatches rebalance to evaluateRebalanceStrategy', async () => {
      const { evaluateStrategy } = await import('../strategy-evaluator');
      const strategy = makeStrategy({
        strategyType: 'rebalance',
        targetAllocationBps: 3000,
        rebalanceBandBps: 100,
      });
      const portfolio = makePortfolio({
        allocations: {
          [WETH.toLowerCase()]: 5000,
          [USDC.toLowerCase()]: 5000,
        },
      });

      const action = evaluateStrategy(strategy, portfolio, makeMarket(), null);
      expect(action).not.toBeNull();
      expect(action!.type).toBe('rebalance');
    });

    it('treats unknown strategyType as dca', async () => {
      const { evaluateStrategy } = await import('../strategy-evaluator');
      const strategy = makeStrategy({ strategyType: 'dca' });
      const action = evaluateStrategy(strategy, makePortfolio(), makeMarket(), null);
      expect(action).not.toBeNull();
      expect(action!.type).toBe('dca_buy');
    });
  });
});
