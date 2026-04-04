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
    agent: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    agentStrategy: { findMany: vi.fn(), create: vi.fn() },
    proposal: { findMany: vi.fn() },
  },
}));

vi.mock('@/services/agentkit', () => ({
  registerAgent: vi.fn().mockResolvedValue({ registered: true }),
}));
vi.mock('@/services/agent-runtime', () => ({
  startAgentLoop: vi.fn().mockResolvedValue(undefined),
  stopAgentLoop: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/constants', () => ({
  WORLD_CHAIN_ID: 480,
  WORLD_ID_ACTION: 'register-agent',
}));

import { GET as getAgents, POST as postAgent } from '@/app/api/agents/route';
import { GET as getAgent, PATCH as patchAgent } from '@/app/api/agents/[id]/route';
import { GET as getStrategies, POST as postStrategy } from '@/app/api/agents/[id]/strategies/route';
import { GET as getProposals } from '@/app/api/agents/[id]/proposals/route';
import { db } from '@/lib/db';
import { getSessionUserId, AuthError } from '@/lib/auth';

const mockGetSession = vi.mocked(getSessionUserId);
const mockAgentFindMany = vi.mocked(db.agent.findMany);
const mockAgentFindUnique = vi.mocked(db.agent.findUnique);
const mockAgentCreate = vi.mocked(db.agent.create);
const mockAgentUpdate = vi.mocked(db.agent.update);
const mockUserFindUnique = vi.mocked(db.user.findUnique);
const mockStrategyFindMany = vi.mocked(db.agentStrategy.findMany);
const mockStrategyCreate = vi.mocked(db.agentStrategy.create);
const mockProposalFindMany = vi.mocked(db.proposal.findMany);

// ── Fixtures ─────────────────────────────────────────────────────────────────
const now = new Date();
const dbAgent = {
  id: 'a1', ownerId: 'u1', walletAddress: '0x' + 'a'.repeat(40),
  agentbookRegId: null, ensName: null, status: 'active',
  usageCount: 0, freeTrialRemaining: 3,
  spendLimits: { maxPerTx: '1000000', dailyCap: '5000000' }, createdAt: now,
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
    mockAgentCreate.mockResolvedValue({ ...dbAgent, status: 'registering' } as never);
  });

  it('returns 201 with registering status', async () => {
    const res = await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: '0x' + 'a'.repeat(40) }),
    }));
    expect(res.status).toBe(201);
    const data = await json<{ status: string }>(res);
    expect(data.status).toBe('registering');
  });

  it('returns 400 for invalid walletAddress', async () => {
    const res = await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: 'not-an-address' }),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing walletAddress', async () => {
    const res = await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when user is not verified', async () => {
    mockUserFindUnique.mockResolvedValue({ ...dbUser, isVerified: false } as never);
    const res = await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: '0x' + 'a'.repeat(40) }),
    }));
    expect(res.status).toBe(403);
  });

  it('defaults spendLimits when not provided', async () => {
    await postAgent(req('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: '0x' + 'a'.repeat(40) }),
    }));
    expect(mockAgentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spendLimits: { maxPerTx: '1000000', dailyCap: '5000000' },
        }),
      })
    );
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
});

// ── GET /api/agents/[id]/proposals ────────────────────────────────────────────

describe('GET /api/agents/[id]/proposals', () => {
  beforeEach(() => {
    mockAgentFindUnique.mockResolvedValue(dbAgent as never);
    mockProposalFindMany.mockResolvedValue([dbProposal] as never);
  });

  it('returns proposals sorted by createdAt desc', async () => {
    await getProposals(
      req('http://localhost/api/agents/a1/proposals'),
      { params: Promise.resolve({ id: 'a1' }) }
    );
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
