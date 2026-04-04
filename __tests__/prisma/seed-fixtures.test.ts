import { describe, it, expect } from 'vitest';
import {
  WETH, USDC, WLD, CHAIN_ID,
  DEMO_USER, DEMO_AGENT,
  DEMO_STRATEGIES, DEMO_EXECUTIONS, DEMO_PROPOSALS,
  makeTxHash, daysAgo,
} from '@/prisma/seed-fixtures';
import { WORLD_CHAIN_ID, WORLD_USDC } from '@/lib/constants';

const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;

// ── Constants ─────────────────────────────────────────────────────────────────

describe('token addresses', () => {
  it('USDC matches the canonical World Chain USDC constant', () => {
    expect(USDC).toBe(WORLD_USDC);
  });

  it('all addresses are valid EVM format', () => {
    for (const addr of [WETH, USDC, WLD]) {
      expect(addr).toMatch(EVM_ADDR);
    }
  });

  it('CHAIN_ID matches WORLD_CHAIN_ID', () => {
    expect(CHAIN_ID).toBe(WORLD_CHAIN_ID);
  });
});

// ── Demo user ────────────────────────────────────────────────────────────────

describe('DEMO_USER', () => {
  it('walletAddress is a valid EVM address', () => {
    expect(DEMO_USER.walletAddress).toMatch(EVM_ADDR);
  });

  it('verificationLevel is orb', () => {
    expect(DEMO_USER.verificationLevel).toBe('orb');
  });

  it('isVerified is true', () => {
    expect(DEMO_USER.isVerified).toBe(true);
  });

  it('nullifierHash is non-empty', () => {
    expect(DEMO_USER.nullifierHash).toBeTruthy();
    expect(DEMO_USER.nullifierHash.startsWith('0x')).toBe(true);
  });
});

// ── Demo agent ───────────────────────────────────────────────────────────────

describe('DEMO_AGENT', () => {
  it('status is active', () => {
    expect(DEMO_AGENT.status).toBe('active');
  });

  it('walletAddress matches DEMO_USER walletAddress', () => {
    expect(DEMO_AGENT.walletAddress).toBe(DEMO_USER.walletAddress);
  });

  it('spendLimits are BigInt-safe strings', () => {
    expect(() => BigInt(DEMO_AGENT.spendLimits.maxPerTx)).not.toThrow();
    expect(() => BigInt(DEMO_AGENT.spendLimits.dailyCap)).not.toThrow();
  });

  it('dailyCap > maxPerTx', () => {
    expect(BigInt(DEMO_AGENT.spendLimits.dailyCap)).toBeGreaterThan(
      BigInt(DEMO_AGENT.spendLimits.maxPerTx)
    );
  });

  it('ensName ends with .copilot.eth', () => {
    expect(DEMO_AGENT.ensName).toMatch(/\.copilot\.eth$/);
  });
});

// ── Demo strategies ──────────────────────────────────────────────────────────

describe('DEMO_STRATEGIES', () => {
  it('contains exactly 3 strategies', () => {
    expect(DEMO_STRATEGIES).toHaveLength(3);
  });

  it('all chainIds are 480', () => {
    for (const s of DEMO_STRATEGIES) {
      expect(s.chainId).toBe(480);
    }
  });

  it('all intervals are valid enum values', () => {
    for (const s of DEMO_STRATEGIES) {
      expect(['hourly', 'daily', 'weekly']).toContain(s.interval);
    }
  });

  it('tokenIn !== tokenOut for every strategy', () => {
    for (const s of DEMO_STRATEGIES) {
      expect(s.tokenIn.toLowerCase()).not.toBe(s.tokenOut.toLowerCase());
    }
  });

  it('amountPerInterval is a valid positive BigInt string', () => {
    for (const s of DEMO_STRATEGIES) {
      const n = BigInt(s.amountPerInterval);
      expect(n).toBeGreaterThan(0n);
    }
  });

  it('at least one strategy has autoExecute=true', () => {
    expect(DEMO_STRATEGIES.some((s) => s.autoExecute)).toBe(true);
  });

  it('at least one strategy has autoExecute=false (manual approve)', () => {
    expect(DEMO_STRATEGIES.some((s) => !s.autoExecute)).toBe(true);
  });

  it('uses USDC in at least one strategy', () => {
    const usesUsdc = DEMO_STRATEGIES.some(
      (s) => s.tokenIn === USDC || s.tokenOut === USDC
    );
    expect(usesUsdc).toBe(true);
  });
});

// ── Demo executions ──────────────────────────────────────────────────────────

describe('DEMO_EXECUTIONS', () => {
  it('contains at least 8 executions', () => {
    expect(DEMO_EXECUTIONS.length).toBeGreaterThanOrEqual(8);
  });

  it('all strategyIdx values are valid DEMO_STRATEGIES indexes', () => {
    for (const ex of DEMO_EXECUTIONS) {
      expect(ex.strategyIdx).toBeGreaterThanOrEqual(0);
      expect(ex.strategyIdx).toBeLessThan(DEMO_STRATEGIES.length);
    }
  });

  it('amountIn and amountOut are positive BigInt strings', () => {
    for (const ex of DEMO_EXECUTIONS) {
      expect(BigInt(ex.amountIn)).toBeGreaterThan(0n);
      expect(BigInt(ex.amountOut)).toBeGreaterThan(0n);
    }
  });

  it('daysBack values are positive and spread over time', () => {
    const days = DEMO_EXECUTIONS.map((e) => e.daysBack);
    const max = Math.max(...days);
    expect(max).toBeGreaterThan(3);
  });

  it('txSeed values are unique (deterministic hash dedup)', () => {
    const seeds = DEMO_EXECUTIONS.map((e) => e.txSeed);
    expect(new Set(seeds).size).toBe(seeds.length);
  });
});

// ── Demo proposals ───────────────────────────────────────────────────────────

describe('DEMO_PROPOSALS', () => {
  it('contains 1 or 2 proposals', () => {
    expect(DEMO_PROPOSALS.length).toBeGreaterThanOrEqual(1);
    expect(DEMO_PROPOSALS.length).toBeLessThanOrEqual(2);
  });

  it('all types are valid proposal types', () => {
    for (const p of DEMO_PROPOSALS) {
      expect(['dca_buy', 'rebalance']).toContain(p.type);
    }
  });

  it('tokenIn !== tokenOut', () => {
    for (const p of DEMO_PROPOSALS) {
      expect(p.tokenIn.toLowerCase()).not.toBe(p.tokenOut.toLowerCase());
    }
  });

  it('amount and estimatedOutput are positive BigInt strings', () => {
    for (const p of DEMO_PROPOSALS) {
      expect(BigInt(p.amount)).toBeGreaterThan(0n);
      expect(BigInt(p.estimatedOutput)).toBeGreaterThan(0n);
    }
  });

  it('strategyIdx values reference manual-approve strategies only', () => {
    // Pending proposals should only come from non-autoExecute strategies
    for (const p of DEMO_PROPOSALS) {
      const strategy = DEMO_STRATEGIES[p.strategyIdx];
      expect(strategy.autoExecute).toBe(false);
    }
  });

  it('reasoning is non-empty for all proposals', () => {
    for (const p of DEMO_PROPOSALS) {
      expect(p.reasoning.length).toBeGreaterThan(10);
    }
  });
});

// ── Partial unique constraint compatibility ──────────────────────────────────
// Verify that DEMO_PROPOSALS cover different strategies (no two pending
// proposals for the same strategy — would violate Proposal_strategy_active_uniq).

describe('seed consistency: no duplicate active strategy proposals', () => {
  it('each pending proposal targets a different strategy', () => {
    const idxs = DEMO_PROPOSALS.map((p) => p.strategyIdx);
    expect(new Set(idxs).size).toBe(idxs.length);
  });
});

// ── Utility functions ────────────────────────────────────────────────────────

describe('makeTxHash', () => {
  it('produces a valid 0x-prefixed hex string', () => {
    const h = makeTxHash(0x1234);
    expect(h).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(h.length).toBeGreaterThan(10);
  });

  it('is deterministic — same seed always gives same hash', () => {
    expect(makeTxHash(42)).toBe(makeTxHash(42));
  });

  it('is unique across different seeds', () => {
    expect(makeTxHash(1)).not.toBe(makeTxHash(2));
  });
});

describe('daysAgo', () => {
  it('returns a Date in the past', () => {
    const d = daysAgo(1);
    expect(d.getTime()).toBeLessThan(Date.now());
  });

  it('is approximately n days before now', () => {
    const n = 5;
    const d = daysAgo(n);
    const diffDays = (Date.now() - d.getTime()) / 86_400_000;
    expect(diffDays).toBeGreaterThanOrEqual(n - 0.01);
    expect(diffDays).toBeLessThanOrEqual(n + 0.01);
  });
});
