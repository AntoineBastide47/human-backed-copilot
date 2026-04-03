import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock db (inline vi.fn() to avoid hoisting trap) ──────────────────────────
vi.mock('@/lib/db', () => ({
  db: {
    agentStrategy: { findMany: vi.fn() },
    proposal: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    execution: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import {
  getAgentStrategies,
  createProposal,
  getApprovedProposals,
  markProposalExecuted,
  saveExecution,
  toStrategyResponse,
  toProposalResponse,
  toExecutionResponse,
  toAgentResponse,
} from '@/lib/agent-service';
import { db } from '@/lib/db';

// ── Typed mock helpers ────────────────────────────────────────────────────────
const mockStrategy = vi.mocked(db.agentStrategy.findMany);
const mockProposalCreate = vi.mocked(db.proposal.create);
const mockProposalFindMany = vi.mocked(db.proposal.findMany);
const mockExecutionCreate = vi.mocked(db.execution.create);
const mockTransaction = vi.mocked(db.$transaction);

// ── Fixtures ─────────────────────────────────────────────────────────────────
const now = new Date();
const isoNow = now.toISOString();

const dbStrategy = {
  id: 's1', agentId: 'a1', name: 'DCA', tokenIn: '0xA', tokenOut: '0xB',
  chainId: 480, amountPerInterval: '1000', interval: 'daily',
  autoExecute: false, status: 'active', createdAt: now,
};
const dbProposal = {
  id: 'p1', agentId: 'a1', strategyId: 's1', type: 'dca_buy',
  tokenIn: '0xA', tokenOut: '0xB', amount: '1000', estimatedOutput: '900',
  reasoning: 'DCA time', status: 'pending', createdAt: now,
};
const dbExecution = {
  id: 'e1', agentId: 'a1', strategyId: 's1', proposalId: 'p1',
  txHash: '0x' + 'a'.repeat(64), amountIn: '1000', amountOut: '900',
  status: 'confirmed', executedAt: now,
};
const dbAgent = {
  id: 'a1', ownerId: 'u1', walletAddress: '0x' + 'b'.repeat(40),
  agentbookRegId: null, ensName: null, status: 'active',
  usageCount: 0, freeTrialRemaining: 3,
  spendLimits: { maxPerTx: '1000', dailyCap: '5000' }, createdAt: now,
};

beforeEach(() => vi.clearAllMocks());

// ── Mapper unit tests ─────────────────────────────────────────────────────────

describe('toStrategyResponse', () => {
  it('converts Date to ISO string', () => {
    expect(toStrategyResponse(dbStrategy).createdAt).toBe(isoNow);
  });
  it('casts interval and status to union types', () => {
    const r = toStrategyResponse(dbStrategy);
    expect(r.interval).toBe('daily');
    expect(r.status).toBe('active');
  });
  it('preserves chainId and agentId', () => {
    const r = toStrategyResponse(dbStrategy);
    expect(r.chainId).toBe(480);
    expect(r.agentId).toBe('a1');
  });
});

describe('toProposalResponse', () => {
  it('converts Date to ISO string', () => {
    expect(toProposalResponse(dbProposal).createdAt).toBe(isoNow);
  });
  it('casts type and status', () => {
    const r = toProposalResponse(dbProposal);
    expect(r.type).toBe('dca_buy');
    expect(r.status).toBe('pending');
  });
});

describe('toExecutionResponse', () => {
  it('converts executedAt to ISO string', () => {
    expect(toExecutionResponse(dbExecution).executedAt).toBe(isoNow);
  });
  it('handles null proposalId → empty string', () => {
    expect(toExecutionResponse({ ...dbExecution, proposalId: null }).proposalId).toBe('');
  });
});

describe('toAgentResponse', () => {
  it('casts spendLimits from Json field', () => {
    expect(toAgentResponse(dbAgent).spendLimits).toEqual({ maxPerTx: '1000', dailyCap: '5000' });
  });
  it('falls back to zero when spendLimits is null', () => {
    expect(toAgentResponse({ ...dbAgent, spendLimits: null }).spendLimits).toEqual({
      maxPerTx: '0', dailyCap: '0',
    });
  });
  it('converts createdAt to ISO string', () => {
    expect(toAgentResponse(dbAgent).createdAt).toBe(isoNow);
  });
});

// ── Service function tests ────────────────────────────────────────────────────

describe('getAgentStrategies', () => {
  it('queries active strategies ordered by createdAt asc', async () => {
    mockStrategy.mockResolvedValue([dbStrategy] as never);
    const result = await getAgentStrategies('a1');
    expect(mockStrategy).toHaveBeenCalledWith({
      where: { agentId: 'a1', status: 'active' },
      orderBy: { createdAt: 'asc' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s1');
  });

  it('returns empty array when none found', async () => {
    mockStrategy.mockResolvedValue([] as never);
    expect(await getAgentStrategies('a1')).toEqual([]);
  });
});

describe('createProposal', () => {
  it('creates proposal and maps response', async () => {
    mockProposalCreate.mockResolvedValue(dbProposal as never);
    const input = {
      agentId: 'a1', strategyId: 's1', type: 'dca_buy' as const,
      tokenIn: '0xA', tokenOut: '0xB', amount: '1000', estimatedOutput: '900',
      reasoning: 'test', status: 'pending' as const,
    };
    const result = await createProposal(input);
    expect(mockProposalCreate).toHaveBeenCalledWith({ data: input });
    expect(result.id).toBe('p1');
    expect(result.createdAt).toBe(isoNow);
  });
});

describe('getApprovedProposals', () => {
  it('queries only approved proposals', async () => {
    mockProposalFindMany.mockResolvedValue([] as never);
    await getApprovedProposals('a1');
    expect(mockProposalFindMany).toHaveBeenCalledWith({
      where: { agentId: 'a1', status: 'approved' },
      orderBy: { createdAt: 'asc' },
    });
  });
});

describe('markProposalExecuted', () => {
  it('runs update + create in a transaction', async () => {
    mockTransaction.mockResolvedValue([] as never);
    const data = {
      agentId: 'a1', strategyId: 's1', proposalId: 'p1',
      txHash: '0xabc', amountIn: '1000', amountOut: '900', status: 'confirmed' as const,
    };
    await markProposalExecuted('p1', data);
    expect(mockTransaction).toHaveBeenCalledOnce();
    const [ops] = mockTransaction.mock.calls[0] as [unknown[]];
    expect(ops).toHaveLength(2);
  });
});

describe('saveExecution', () => {
  it('creates execution and maps response', async () => {
    mockExecutionCreate.mockResolvedValue(dbExecution as never);
    const data = {
      agentId: 'a1', strategyId: 's1',
      txHash: '0xabc', amountIn: '1000', amountOut: '900', status: 'confirmed' as const,
    };
    const result = await saveExecution(data);
    expect(result.id).toBe('e1');
    expect(result.executedAt).toBe(isoNow);
  });
});
