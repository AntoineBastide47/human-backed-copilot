import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      }),
  },
}));

// ── Auth mock (inline to avoid hoisting trap) ─────────────────────────────────
vi.mock('@/lib/auth', () => ({
  getSessionUserId: vi.fn(),
  AuthError: class AuthError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
}));

// ── DB mock (inline vi.fn() to avoid hoisting trap) ──────────────────────────
vi.mock('@/lib/db', () => ({
  db: {
    $transaction: vi.fn(),
    agent: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
    agentStrategy: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    proposal: { findMany: vi.fn(), deleteMany: vi.fn() },
    execution: { deleteMany: vi.fn() },
  },
}));

vi.mock('@/services/agentkit', () => ({
  registerAgent: vi.fn().mockResolvedValue({ registered: true }),
  verifyAgentIsHuman: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/services/agent-runtime', () => ({
  startAgentLoop: vi.fn().mockResolvedValue(undefined),
  stopAgentLoop: vi.fn().mockResolvedValue(undefined),
  runAgentCycleOnce: vi.fn().mockResolvedValue(undefined),
  syncAgentProposalsOnce: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/uniswap', () => ({
  getQuote: vi.fn().mockResolvedValue({ quote: { quote: '900000000' } }),
}));
vi.mock('@/services/token-balances', () => ({
  getTokenBalances: vi.fn(),
}));
vi.mock('@/lib/constants', () => ({
  WORLD_CHAIN_ID: 480,
  WORLD_ID_ACTION: 'register-agent',
  ENS_PARENT_NAME: 'provix.eth',
}));
vi.mock('@/lib/ens', () => ({
  registerAgentENS: vi.fn().mockResolvedValue('agent-bbbbbb.provix.eth'),
}));

import { GET as getAgents, POST as postAgent } from '@/app/api/agents/route';
import { GET as getAgent, PATCH as patchAgent, DELETE as deleteAgent } from '@/app/api/agents/[id]/route';
import { GET as getStrategies, POST as postStrategy, DELETE as deleteStrategies } from '@/app/api/agents/[id]/strategies/route';
import { DELETE as cleanupAgents } from '@/app/api/agents/cleanup/route';
import { GET as getProposals } from '@/app/api/agents/[id]/proposals/route';
import { db } from '@/lib/db';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { runAgentCycleOnce, stopAgentLoop, syncAgentProposalsOnce } from '@/services/agent-runtime';
import { getQuote } from '@/services/uniswap';
import { getTokenBalances } from '@/services/token-balances';

const mockGetSession = vi.mocked(getSessionUserId);
const mockTransaction = vi.mocked(db.$transaction);
const mockAgentFindMany = vi.mocked(db.agent.findMany);
const mockAgentFindUnique = vi.mocked(db.agent.findUnique);
const mockAgentCreate = vi.mocked(db.agent.create);
const mockAgentUpdate = vi.mocked(db.agent.update);
const mockAgentDelete = vi.mocked(db.agent.delete);
const mockAgentDeleteMany = vi.mocked(db.agent.deleteMany);
const mockUserFindUnique = vi.mocked(db.user.findUnique);
const mockStrategyFindMany = vi.mocked(db.agentStrategy.findMany);
const mockStrategyCreate = vi.mocked(db.agentStrategy.create);
const mockStrategyDeleteMany = vi.mocked(db.agentStrategy.deleteMany);
const mockProposalFindMany = vi.mocked(db.proposal.findMany);
const mockProposalDeleteMany = vi.mocked(db.proposal.deleteMany);
const mockExecutionDeleteMany = vi.mocked(db.execution.deleteMany);
const mockStopAgentLoop = vi.mocked(stopAgentLoop);
const mockRunAgentCycleOnce = vi.mocked(runAgentCycleOnce);
const mockSyncAgentProposalsOnce = vi.mocked(syncAgentProposalsOnce);
const mockGetQuote = vi.mocked(getQuote);
const mockGetTokenBalances = vi.mocked(getTokenBalances);

// ── Fixtures ─────────────────────────────────────────────────────────────────
const now = new Date();
const dbAgent = {
  id: 'a1', ownerId: 'u1', walletAddress: '0x' + 'a'.repeat(40),
  agentbookRegId: null, ensName: null, status: 'active',
  usageCount: 0, freeTrialRemaining: 3,
  spendLimits: { maxPerTx: '1000000000', dailyCap: '5000000000' }, createdAt: now,
};
const dbUser = {
  id: 'u1', nullifierHash: '0xn', walletAddress: '0x' + 'b'.repeat(40),
  verificationLevel: 'orb', isVerified: true, createdAt: now,
};
const dbStrategy = {
  id: 's1', agentId: 'a1', name: 'DCA', tokenIn: '0x' + 'c'.repeat(40),
  tokenOut: '0x' + 'd'.repeat(40), chainId: 480, amountPerInterval: '1000000000000000000',
  interval: 'daily', autoExecute: false, status: 'active', createdAt: now,
};
const dbProposal = {
  id: 'p1', agentId: 'a1', strategyId: 's1', type: 'dca_buy',
  tokenIn: '0x' + 'c'.repeat(40), tokenOut: '0x' + 'd'.repeat(40),
  amount: '1000000000000000000', estimatedOutput: '900000000',
  reasoning: 'DCA interval', status: 'pending', createdAt: now,
};

function req(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
async function json<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue('u1' as never);
  mockGetTokenBalances.mockResolvedValue({
    [dbProposal.tokenIn.toLowerCase()]: '750000000000000000',
    [dbProposal.tokenOut.toLowerCase()]: '250000000',
  } as never);
  process.env.AGENT_CLEANUP_SECRET = 'cleanup-secret';
  mockTransaction.mockImplementation(async (callback) => {
    if (typeof callback !== 'function') {
      throw new Error('Expected transaction callback');
    }
    return callback(db as never);
  });
});

// ── GET /api/agents ───────────────────────────────────────────────────────────

describe('GET /api/agents', () => {
  it('returns 401 when no session', async () => {
    mockGetSession.mockRejectedValue(new AuthError('Unauthorized', 401));
    const res = await getAgents(req('http://localhost/api/agents'));
    expect(res.status).toBe(401);
  });

  it('returns agents for authenticated user', async () => {
    mockAgentFindMany.mockResolvedValue([dbAgent] as never);
    const res = await getAgents(req('http://localhost/api/agents'));
    expect(res.status).toBe(200);
    const data = await json<{ id: string }[]>(res);
    expect(data[0].id).toBe('a1');
    expect(mockAgentFindMany).toHaveBeenCalledWith({
      where: { ownerId: 'u1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns empty array when user has no agents', async () => {
    mockAgentFindMany.mockResolvedValue([] as never);
    const res = await getAgents(req('http://localhost/api/agents'));
    expect(await json(res)).toEqual([]);
  });
});

// ── POST /api/agents ──────────────────────────────────────────────────────────

describe('POST /api/agents', () => {
  beforeEach(() => {
    mockUserFindUnique.mockResolvedValue(dbUser as never);
    mockAgentCreate.mockResolvedValue(dbAgent as never);
  });

  it('returns 201 with active status', async () => {
    const res = await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(201);
    const data = await json<{ status: string }>(res);
    expect(data.status).toBe('active');
  });

  it('uses the verified World wallet instead of any posted wallet address', async () => {
    await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: '0x' + 'a'.repeat(40) }),
    }));

    expect(mockAgentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          walletAddress: dbUser.walletAddress,
        }),
      })
    );
  });

  it('returns 403 when user is not verified', async () => {
    mockUserFindUnique.mockResolvedValue({ ...dbUser, isVerified: false } as never);
    const res = await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when the verified World wallet is missing', async () => {
    mockUserFindUnique.mockResolvedValue({ ...dbUser, walletAddress: '' } as never);
    const res = await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(403);
  });

  it('defaults spendLimits when not provided', async () => {
    await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({}),
    }));
    expect(mockAgentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          walletAddress: dbUser.walletAddress,
          spendLimits: { maxPerTx: '1000000000', dailyCap: '5000000000' },
        }),
      })
    );
  });

  it('returns 403 when wallet is not registered in AgentBook', async () => {
    const { verifyAgentIsHuman } = await import('@/services/agentkit');
    vi.mocked(verifyAgentIsHuman).mockResolvedValueOnce(false as never);

    const res = await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    expect(res.status).toBe(403);
    const data = await json<{ error: string }>(res);
    expect(data.error).toContain('agentkit-cli register');
  });

  it('fires ENS registration with wallet from verified user', async () => {
    const { registerAgentENS } = await import('@/lib/ens');
    process.env.JUSTANAME_API_KEY = 'test-key';

    await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    // Let the fire-and-forget microtask queue drain
    await new Promise((r) => setTimeout(r, 0));

    expect(vi.mocked(registerAgentENS)).toHaveBeenCalledWith(
      dbUser.walletAddress,
      expect.objectContaining({
        strategy: 'dca',
        worldIdVerified: true,
        owner: dbUser.walletAddress,
      }),
      'agent-bbbbbb',
    );

    delete process.env.JUSTANAME_API_KEY;
  });

  it('persists ENS name to agent after successful registration', async () => {
    process.env.JUSTANAME_API_KEY = 'test-key';

    await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    await new Promise((r) => setTimeout(r, 0));

    expect(mockAgentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: dbAgent.id },
        data: { ensName: 'agent-bbbbbb.provix.eth' },
      }),
    );

    delete process.env.JUSTANAME_API_KEY;
  });

  it('passes a custom ENS label override through to registration', async () => {
    const { registerAgentENS } = await import('@/lib/ens');
    process.env.JUSTANAME_API_KEY = 'test-key';

    await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ ensName: 'desk-trader' }),
    }));

    await new Promise((r) => setTimeout(r, 0));

    expect(vi.mocked(registerAgentENS)).toHaveBeenCalledWith(
      dbUser.walletAddress,
      expect.objectContaining({
        strategy: 'dca',
        worldIdVerified: true,
        owner: dbUser.walletAddress,
      }),
      'desk-trader',
    );

    delete process.env.JUSTANAME_API_KEY;
  });

  it('agent creation succeeds even when ENS registration throws', async () => {
    const { registerAgentENS } = await import('@/lib/ens');
    vi.mocked(registerAgentENS).mockRejectedValueOnce(new Error('JustaName timeout'));
    process.env.JUSTANAME_API_KEY = 'test-key';

    const res = await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    await new Promise((r) => setTimeout(r, 0));

    expect(res.status).toBe(201);

    delete process.env.JUSTANAME_API_KEY;
  });

  it('skips ENS registration when no JUSTANAME_API_KEY or L2_REGISTRAR_ADDRESS', async () => {
    const { registerAgentENS } = await import('@/lib/ens');
    delete process.env.JUSTANAME_API_KEY;
    delete process.env.L2_REGISTRAR_ADDRESS;

    await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    await new Promise((r) => setTimeout(r, 0));

    expect(vi.mocked(registerAgentENS)).not.toHaveBeenCalled();
  });
});

// ── GET /api/agents/[id] ──────────────────────────────────────────────────────

describe('GET /api/agents/[id]', () => {
  it('returns agent when owner matches', async () => {
    mockAgentFindUnique.mockResolvedValue(dbAgent as never);
    const res = await getAgent(req('http://localhost/api/agents/a1'), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(200);
    expect((await json<{ id: string }>(res)).id).toBe('a1');
  });

  it('returns 404 when agent belongs to a different user', async () => {
    mockAgentFindUnique.mockResolvedValue({ ...dbAgent, ownerId: 'other' } as never);
    const res = await getAgent(req('http://localhost/api/agents/a1'), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when agent does not exist', async () => {
    mockAgentFindUnique.mockResolvedValue(null as never);
    const res = await getAgent(req('http://localhost/api/agents/nope'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(res.status).toBe(404);
  });
});

// ── GET /api/agents/[id]/strategies ──────────────────────────────────────────

describe('GET /api/agents/[id]/strategies', () => {
  beforeEach(() => {
    mockAgentFindUnique.mockResolvedValue(dbAgent as never);
    mockStrategyFindMany.mockResolvedValue([dbStrategy] as never);
  });

  it('returns strategies for owned agent', async () => {
    const res = await getStrategies(req('http://localhost/api/agents/a1/strategies'), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(200);
    const data = await json<{ agentId: string }[]>(res);
    expect(data[0].agentId).toBe('a1');
  });

  it('returns 404 for unowned agent', async () => {
    mockAgentFindUnique.mockResolvedValue({ ...dbAgent, ownerId: 'other' } as never);
    const res = await getStrategies(req('http://localhost/api/agents/a1/strategies'), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(404);
  });
});

// ── POST /api/agents/[id]/strategies ─────────────────────────────────────────

describe('POST /api/agents/[id]/strategies', () => {
  beforeEach(() => {
    mockAgentFindUnique.mockResolvedValue(dbAgent as never);
    mockStrategyCreate.mockResolvedValue(dbStrategy as never);
    mockRunAgentCycleOnce.mockResolvedValue(undefined as never);
    mockGetQuote.mockResolvedValue({ quote: { quote: '900000000' } } as never);
  });

  const validStrategy = {
    name: 'Daily DCA',
    tokenIn: '0x' + 'c'.repeat(40),
    tokenOut: '0x' + 'd'.repeat(40),
    amountPerInterval: '1000000000000000000',
    interval: 'daily',
  };

  it('creates strategy and returns 201', async () => {
    const res = await postStrategy(
      req('http://localhost/api/agents/a1/strategies', { method: 'POST', body: JSON.stringify(validStrategy) }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(201);
    const data = await json<{ chainId: number }>(res);
    expect(data.chainId).toBe(480);
    expect(mockGetQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenIn: validStrategy.tokenIn,
        tokenOut: validStrategy.tokenOut,
        amount: validStrategy.amountPerInterval,
        chainId: 480,
      }),
      { swapper: dbAgent.walletAddress }
    );
    expect(mockRunAgentCycleOnce).toHaveBeenCalledWith('a1');
  });

  it('returns 400 when Uniswap has no quote for the strategy', async () => {
    mockGetQuote.mockRejectedValueOnce(
      new Error('Uniswap quote failed (404): {"errorCode":"ResourceNotFound","detail":"No quotes available"}') as never
    );

    const res = await postStrategy(
      req('http://localhost/api/agents/a1/strategies', { method: 'POST', body: JSON.stringify(validStrategy) }),
      { params: Promise.resolve({ id: 'a1' }) }
    );

    expect(res.status).toBe(400);
    expect(await json<{ error: string }>(res)).toEqual({
      error: 'No Uniswap quote is available for this token pair and amount on World Chain',
    });
    expect(mockStrategyCreate).not.toHaveBeenCalled();
    expect(mockRunAgentCycleOnce).not.toHaveBeenCalled();
  });

  it('returns 400 when tokenIn === tokenOut', async () => {
    const addr = '0x' + 'e'.repeat(40);
    const res = await postStrategy(
      req('http://localhost/api/agents/a1/strategies', {
        method: 'POST',
        body: JSON.stringify({ ...validStrategy, tokenIn: addr, tokenOut: addr }),
      }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid interval', async () => {
    const res = await postStrategy(
      req('http://localhost/api/agents/a1/strategies', {
        method: 'POST',
        body: JSON.stringify({ ...validStrategy, interval: 'monthly' }),
      }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-World-Chain chainId', async () => {
    const res = await postStrategy(
      req('http://localhost/api/agents/a1/strategies', {
        method: 'POST',
        body: JSON.stringify({ ...validStrategy, chainId: 1 }),
      }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for zero amountPerInterval', async () => {
    const res = await postStrategy(
      req('http://localhost/api/agents/a1/strategies', {
        method: 'POST',
        body: JSON.stringify({ ...validStrategy, amountPerInterval: '0' }),
      }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid tokenIn address', async () => {
    const res = await postStrategy(
      req('http://localhost/api/agents/a1/strategies', {
        method: 'POST',
        body: JSON.stringify({ ...validStrategy, tokenIn: 'not-an-address' }),
      }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when agent not owned by user', async () => {
    mockAgentFindUnique.mockResolvedValue({ ...dbAgent, ownerId: 'other' } as never);
    const res = await postStrategy(
      req('http://localhost/api/agents/a1/strategies', { method: 'POST', body: JSON.stringify(validStrategy) }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 when agent is still registering', async () => {
    mockAgentFindUnique.mockResolvedValue({ ...dbAgent, status: 'registering' } as never);
    const res = await postStrategy(
      req('http://localhost/api/agents/a1/strategies', { method: 'POST', body: JSON.stringify(validStrategy) }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(409);
    const data = await json<{ error: string }>(res);
    expect(data.error).toContain('registering');
    expect(mockStrategyCreate).not.toHaveBeenCalled();
  });

  it('allows strategy creation on a paused agent', async () => {
    mockAgentFindUnique.mockResolvedValue({ ...dbAgent, status: 'paused' } as never);
    const res = await postStrategy(
      req('http://localhost/api/agents/a1/strategies', { method: 'POST', body: JSON.stringify(validStrategy) }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(201);
  });
});

// ── DELETE /api/agents/[id]/strategies ────────────────────────────────────────

describe('DELETE /api/agents/[id]/strategies', () => {
  beforeEach(() => {
    mockAgentFindUnique.mockResolvedValue(dbAgent as never);
    mockStrategyFindMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }] as never);
    mockExecutionDeleteMany.mockResolvedValue({ count: 2 } as never);
    mockProposalDeleteMany.mockResolvedValue({ count: 2 } as never);
    mockStrategyDeleteMany.mockResolvedValue({ count: 2 } as never);
    mockStopAgentLoop.mockResolvedValue(undefined as never);
  });

  it('deletes all strategies and dependent rows for the owned agent', async () => {
    const res = await deleteStrategies(
      req('http://localhost/api/agents/a1/strategies', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );

    expect(res.status).toBe(200);
    expect(await json<{ deleted: boolean; strategiesDeleted: number }>(res)).toEqual({
      deleted: true,
      strategiesDeleted: 2,
    });
    expect(mockStrategyFindMany).toHaveBeenCalledWith({
      where: { agentId: 'a1' },
      select: { id: true },
    });
    expect(mockExecutionDeleteMany).toHaveBeenCalledWith({
      where: { strategyId: { in: ['s1', 's2'] } },
    });
    expect(mockProposalDeleteMany).toHaveBeenCalledWith({
      where: { strategyId: { in: ['s1', 's2'] } },
    });
    expect(mockStrategyDeleteMany).toHaveBeenCalledWith({
      where: { agentId: 'a1' },
    });
    expect(mockStopAgentLoop).toHaveBeenCalledWith('a1');
  });

  it('returns 404 when the agent does not belong to the session user', async () => {
    mockAgentFindUnique.mockResolvedValue({ ...dbAgent, ownerId: 'other-user' } as never);

    const res = await deleteStrategies(
      req('http://localhost/api/agents/a1/strategies', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );

    expect(res.status).toBe(404);
    expect(mockStrategyFindMany).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockStopAgentLoop).not.toHaveBeenCalled();
  });
});

// ── DELETE /api/agents/cleanup?scope=strategies ──────────────────────────────

describe('DELETE /api/agents/cleanup?scope=strategies', () => {
  beforeEach(() => {
    mockStrategyFindMany.mockResolvedValue([
      { id: 's1', agentId: 'a1' },
      { id: 's2', agentId: 'a1' },
      { id: 's3', agentId: 'a2' },
    ] as never);
    mockExecutionDeleteMany.mockResolvedValue({ count: 3 } as never);
    mockProposalDeleteMany.mockResolvedValue({ count: 3 } as never);
    mockStrategyDeleteMany.mockResolvedValue({ count: 3 } as never);
    mockStopAgentLoop.mockResolvedValue(undefined as never);
  });

  it('deletes all strategies across all agents without a session when the cleanup secret matches', async () => {
    mockGetSession.mockRejectedValue(new AuthError('Unauthorized', 401));

    const res = await cleanupAgents(req('http://localhost/api/agents/cleanup?scope=strategies', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer cleanup-secret' },
    }));

    expect(res.status).toBe(200);
    expect(await json<{
      deleted: boolean;
      scope: string;
      executionsDeleted: number;
      proposalsDeleted: number;
      strategiesDeleted: number;
      agentsAffected: number;
    }>(res)).toEqual({
      deleted: true,
      scope: 'strategies',
      executionsDeleted: 3,
      proposalsDeleted: 3,
      strategiesDeleted: 3,
      agentsAffected: 2,
    });
    expect(mockStrategyFindMany).toHaveBeenCalledWith({
      select: { id: true, agentId: true },
    });
    expect(mockExecutionDeleteMany).toHaveBeenCalledWith({
      where: { strategyId: { in: ['s1', 's2', 's3'] } },
    });
    expect(mockProposalDeleteMany).toHaveBeenCalledWith({
      where: { strategyId: { in: ['s1', 's2', 's3'] } },
    });
    expect(mockStrategyDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['s1', 's2', 's3'] } },
    });
    expect(mockStopAgentLoop).toHaveBeenCalledWith('a1');
    expect(mockStopAgentLoop).toHaveBeenCalledWith('a2');
    expect(mockAgentDeleteMany).not.toHaveBeenCalled();
  });

  it('rejects cleanup when the secret is missing or invalid', async () => {
    mockGetSession.mockRejectedValue(new AuthError('Unauthorized', 401));

    const res = await cleanupAgents(req('http://localhost/api/agents/cleanup?scope=strategies', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer wrong-secret' },
    }));

    expect(res.status).toBe(403);
    expect(mockStrategyFindMany).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockStopAgentLoop).not.toHaveBeenCalled();
  });
});

// ── GET /api/agents/[id]/proposals ────────────────────────────────────────────

describe('GET /api/agents/[id]/proposals', () => {
  beforeEach(() => {
    mockAgentFindUnique.mockResolvedValue(dbAgent as never);
    mockProposalFindMany.mockResolvedValue([dbProposal] as never);
    mockSyncAgentProposalsOnce.mockResolvedValue(undefined as never);
  });

  it('returns proposals sorted by createdAt desc', async () => {
    await getProposals(
      req('http://localhost/api/agents/a1/proposals'),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(mockSyncAgentProposalsOnce).toHaveBeenCalledWith('a1');
    expect(mockProposalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } })
    );
  });

  it('passes status filter to DB query', async () => {
    await getProposals(
      req('http://localhost/api/agents/a1/proposals?status=pending'),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(mockProposalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { agentId: 'a1', status: 'pending' } })
    );
  });

  it('returns 400 for invalid status filter', async () => {
    const res = await getProposals(
      req('http://localhost/api/agents/a1/proposals?status=invalid'),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for unowned agent', async () => {
    mockAgentFindUnique.mockResolvedValue({ ...dbAgent, ownerId: 'other' } as never);
    const res = await getProposals(
      req('http://localhost/api/agents/a1/proposals'),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(404);
  });

  it('omits status from DB query when no filter provided', async () => {
    await getProposals(
      req('http://localhost/api/agents/a1/proposals'),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    const call = mockProposalFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where).not.toHaveProperty('status');
  });

  it('includes token balances for the proposal wallet', async () => {
    const res = await getProposals(
      req('http://localhost/api/agents/a1/proposals?status=pending'),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(200);
    const data = await json<Array<{ tokenInBalance?: string; tokenOutBalance?: string }>>(res);
    expect(data[0].tokenInBalance).toBe('750000000000000000');
    expect(data[0].tokenOutBalance).toBe('250000000');
    expect(mockGetTokenBalances).toHaveBeenCalledWith(
      dbAgent.walletAddress,
      [dbProposal.tokenIn, dbProposal.tokenOut],
    );
  });
});

// ── PATCH /api/agents/[id] ────────────────────────────────────────────────────

describe('PATCH /api/agents/[id]', () => {
  const pausedAgent = { ...dbAgent, status: 'paused' };

  beforeEach(() => {
    mockAgentFindUnique.mockResolvedValue(dbAgent as never);
    mockAgentUpdate.mockResolvedValue({ ...dbAgent, status: 'paused' } as never);
  });

  it('pauses an active agent and returns 200', async () => {
    const res = await patchAgent(
      req('http://localhost/api/agents/a1', { method: 'PATCH', body: JSON.stringify({ status: 'paused' }) }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(200);
    const data = await json<{ status: string }>(res);
    expect(data.status).toBe('paused');
    expect(mockAgentUpdate).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: 'paused' } });
  });

  it('resumes a paused agent and returns 200', async () => {
    mockAgentFindUnique.mockResolvedValue(pausedAgent as never);
    mockAgentUpdate.mockResolvedValue({ ...dbAgent, status: 'active' } as never);
    const res = await patchAgent(
      req('http://localhost/api/agents/a1', { method: 'PATCH', body: JSON.stringify({ status: 'active' }) }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(200);
    expect((await json<{ status: string }>(res)).status).toBe('active');
  });

  it('returns 409 when pausing an already-paused agent (idempotency guard)', async () => {
    mockAgentFindUnique.mockResolvedValue(pausedAgent as never);
    const res = await patchAgent(
      req('http://localhost/api/agents/a1', { method: 'PATCH', body: JSON.stringify({ status: 'paused' }) }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(409);
    expect(mockAgentUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 when agent is still registering', async () => {
    mockAgentFindUnique.mockResolvedValue({ ...dbAgent, status: 'registering' } as never);
    const res = await patchAgent(
      req('http://localhost/api/agents/a1', { method: 'PATCH', body: JSON.stringify({ status: 'paused' }) }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(409);
    const data = await json<{ error: string }>(res);
    expect(data.error).toContain('registering');
    expect(mockAgentUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid status value', async () => {
    const res = await patchAgent(
      req('http://localhost/api/agents/a1', { method: 'PATCH', body: JSON.stringify({ status: 'registering' }) }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(400);
    expect(mockAgentUpdate).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockRejectedValue(new AuthError('Unauthorized', 401));
    const res = await patchAgent(
      req('http://localhost/api/agents/a1', { method: 'PATCH', body: JSON.stringify({ status: 'paused' }) }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when agent does not belong to the session user', async () => {
    mockAgentFindUnique.mockResolvedValue({ ...dbAgent, ownerId: 'other-user' } as never);
    const res = await patchAgent(
      req('http://localhost/api/agents/a1', { method: 'PATCH', body: JSON.stringify({ status: 'paused' }) }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/agents/[id] ───────────────────────────────────────────────────

describe('DELETE /api/agents/[id]', () => {
  beforeEach(() => {
    mockAgentFindUnique.mockResolvedValue(dbAgent as never);
    mockExecutionDeleteMany.mockResolvedValue({ count: 0 } as never);
    mockProposalDeleteMany.mockResolvedValue({ count: 0 } as never);
    mockStrategyDeleteMany.mockResolvedValue({ count: 0 } as never);
    mockAgentDelete.mockResolvedValue(dbAgent as never);
    mockStopAgentLoop.mockResolvedValue(undefined as never);
  });

  it('returns 200 and deletes the agent with all related records', async () => {
    const res = await deleteAgent(
      req('http://localhost/api/agents/a1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });

    expect(mockExecutionDeleteMany).toHaveBeenCalledWith({ where: { agentId: 'a1' } });
    expect(mockProposalDeleteMany).toHaveBeenCalledWith({ where: { agentId: 'a1' } });
    expect(mockStrategyDeleteMany).toHaveBeenCalledWith({ where: { agentId: 'a1' } });
    expect(mockAgentDelete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    expect(mockStopAgentLoop).toHaveBeenCalledWith('a1');
  });

  it('deletes in dependency order (executions → proposals → strategies → agent)', async () => {
    const order: string[] = [];
    mockExecutionDeleteMany.mockImplementation(async () => { order.push('executions'); return { count: 0 }; });
    mockProposalDeleteMany.mockImplementation(async () => { order.push('proposals'); return { count: 0 }; });
    mockStrategyDeleteMany.mockImplementation(async () => { order.push('strategies'); return { count: 0 }; });
    mockAgentDelete.mockImplementation(async () => { order.push('agent'); return dbAgent; });

    await deleteAgent(
      req('http://localhost/api/agents/a1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(order).toEqual(['executions', 'proposals', 'strategies', 'agent']);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockRejectedValue(new AuthError('Unauthorized', 401));
    const res = await deleteAgent(
      req('http://localhost/api/agents/a1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(401);
    expect(mockAgentDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when agent does not belong to the session user', async () => {
    mockAgentFindUnique.mockResolvedValue({ ...dbAgent, ownerId: 'other-user' } as never);
    const res = await deleteAgent(
      req('http://localhost/api/agents/a1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockStopAgentLoop).not.toHaveBeenCalled();
  });

  it('returns 404 when agent does not exist', async () => {
    mockAgentFindUnique.mockResolvedValue(null as never);
    const res = await deleteAgent(
      req('http://localhost/api/agents/a1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockStopAgentLoop).not.toHaveBeenCalled();
  });
});
