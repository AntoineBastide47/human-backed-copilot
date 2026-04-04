/**
 * Sync #4 full-gate integration test
 *
 * Validates the complete backend path:
 *   verify → register agent → create strategy → fetch proposals
 *   → approve proposal → fetch execution history
 *
 * Each step's response shape is asserted against what the next step and the
 * frontend actually consume. Mocks replace the DB and external services but the
 * full route handler logic runs for every step.
 */
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

vi.mock('@/lib/verify', () => ({ verifyWorldIdProof: vi.fn() }));

vi.mock('@/lib/auth', () => ({
  getSessionUserId: vi.fn(),
  signSession: vi.fn(),
  sessionCookie: vi.fn(() => 'session=tok; HttpOnly; Path=/; SameSite=Lax'),
  AuthError: class AuthError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    user: { upsert: vi.fn(), findUnique: vi.fn() },
    agent: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    agentStrategy: { findMany: vi.fn(), create: vi.fn() },
    proposal: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    execution: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/agent-service', () => ({
  toAgentResponse: vi.fn((r) => ({ ...r, createdAt: r.createdAt.toISOString(), spendLimits: { maxPerTx: '1000000000', dailyCap: '5000000000' } })),
  toStrategyResponse: vi.fn((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  toProposalResponse: vi.fn((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  toExecutionResponse: vi.fn((r) => ({ ...r, executedAt: r.executedAt.toISOString(), proposalId: r.proposalId ?? '' })),
  markProposalExecuted: vi.fn(),
  getLastExecutionForStrategy: vi.fn().mockResolvedValue(null),
  updateProposalStatus: vi.fn().mockResolvedValue(undefined),
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
  executeSwap: vi.fn(),
  getQuote: vi.fn().mockResolvedValue({ quote: { quote: '900000000' } }),
}));
vi.mock('@/lib/constants', () => ({
  WORLD_ID_ACTION: 'register-agent',
  WORLD_CHAIN_ID: 480,
  WORLD_USDC: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
}));

import { POST as verifyHandler } from '@/app/api/verify/route';
import { POST as postAgent } from '@/app/api/agents/route';
import { POST as postStrategy } from '@/app/api/agents/[id]/strategies/route';
import { GET as getProposals } from '@/app/api/agents/[id]/proposals/route';
import { POST as approveHandler } from '@/app/api/agents/[id]/approve/route';
import { GET as getExecutions } from '@/app/api/executions/route';
import { verifyWorldIdProof } from '@/lib/verify';
import { getSessionUserId, signSession, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { markProposalExecuted } from '@/lib/agent-service';
import { executeSwap } from '@/services/uniswap';

const mockVerify = vi.mocked(verifyWorldIdProof);
const mockGetSession = vi.mocked(getSessionUserId);
const mockSignSession = vi.mocked(signSession);
const mockUserUpsert = vi.mocked(db.user.upsert);
const mockAgentFindUnique = vi.mocked(db.agent.findUnique);
const mockAgentCreate = vi.mocked(db.agent.create);
const mockUserFindUnique = vi.mocked(db.user.findUnique);
const mockStrategyCreate = vi.mocked(db.agentStrategy.create);
const mockProposalFindMany = vi.mocked(db.proposal.findMany);
const mockProposalFindUnique = vi.mocked(db.proposal.findUnique);
const mockProposalUpdateMany = vi.mocked(db.proposal.updateMany);
const mockProposalUpdate = vi.mocked(db.proposal.update);
const mockExecutionFindMany = vi.mocked(db.execution.findMany);
const mockMarkExecuted = vi.mocked(markProposalExecuted);
const mockSwap = vi.mocked(executeSwap);

// ── Shared fixtures ────────────────────────────────────────────────────────────

const WALLET = '0x' + 'a'.repeat(40);
const TOKEN_IN = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1'; // USDC
const TOKEN_OUT = '0x4200000000000000000000000000000000000006'; // WETH
const TX_HASH = '0x' + 'f'.repeat(64);
const now = new Date();

const dbUser = {
  id: 'u1', nullifierHash: '0xnull', walletAddress: WALLET,
  verificationLevel: 'orb', isVerified: true, createdAt: now,
};
const dbAgent = {
  id: 'a1', ownerId: 'u1', walletAddress: WALLET,
  agentbookRegId: null, ensName: null, status: 'active',
  usageCount: 0, freeTrialRemaining: 3,
  spendLimits: { maxPerTx: '1000000000', dailyCap: '5000000000' },
  createdAt: now,
};
const dbStrategy = {
  id: 's1', agentId: 'a1', name: 'Daily DCA', tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT,
  chainId: 480, amountPerInterval: '1000000', interval: 'daily',
  autoExecute: false, status: 'active', createdAt: now,
};
const dbProposal = {
  id: 'p1', agentId: 'a1', strategyId: 's1', type: 'dca_buy',
  tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT, amount: '1000000',
  estimatedOutput: '900000000000000', reasoning: 'DCA interval reached',
  status: 'pending', createdAt: now,
  agent: dbAgent,
};
const dbExecution = {
  id: 'exec-1', agentId: 'a1', strategyId: 's1', proposalId: 'p1',
  txHash: TX_HASH, amountIn: '1000000', amountOut: '900000000000000',
  status: 'confirmed', executedAt: now,
};

function postReq(url: string, body: unknown): Request {
  return new Request(url, { method: 'POST', body: JSON.stringify(body) });
}
async function json<T>(res: Response): Promise<T> { return res.json() as Promise<T>; }

// ── Sync #4 full gate ─────────────────────────────────────────────────────────

describe('Sync #4 — full backend gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue('u1' as never);
    mockSignSession.mockResolvedValue('signed-token' as never);
    mockVerify.mockResolvedValue({ success: true });
    mockUserUpsert.mockResolvedValue(dbUser as never);
    mockUserFindUnique.mockResolvedValue(dbUser as never);
    mockAgentFindUnique.mockResolvedValue(dbAgent as never);
    mockAgentCreate.mockResolvedValue(dbAgent as never);
    mockStrategyCreate.mockResolvedValue(dbStrategy as never);
    mockProposalFindMany.mockResolvedValue([dbProposal] as never);
    mockProposalFindUnique.mockResolvedValue(dbProposal as never);
    mockProposalUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockProposalUpdate.mockResolvedValue(dbProposal as never);
    mockExecutionFindMany.mockResolvedValue([dbExecution] as never);
    mockMarkExecuted.mockResolvedValue(undefined as never);
    mockSwap.mockResolvedValue({
      success: true, txHash: TX_HASH, amountIn: '1000000', amountOut: '900000000000000',
    } as never);
  });

  // Step 1 ── Verify World ID proof → receive session cookie + userId
  it('step 1: POST /api/verify returns verified=true with session cookie', async () => {
    const res = await verifyHandler(postReq('http://localhost/api/verify', {
      payload: {
        merkle_root: '0xmerkle', nullifier_hash: '0xnull', proof: '0xproof',
        credential_type: 'orb', verification_level: 'orb',
      },
      action: 'register-agent',
      signal: WALLET,
    }));
    expect(res.status).toBe(200);
    const body = await json<{ userId: string; verified: boolean; walletAddress: string }>(res);
    expect(body.verified).toBe(true);
    expect(body.userId).toBe('u1');
    expect(body.walletAddress).toBe(WALLET);
    expect(res.headers.get('set-cookie')).toContain('session=');
  });

  // Step 2 ── Create agent once AgentBook registration is confirmed
  it('step 2: POST /api/agents returns agent with status=active', async () => {
    const res = await postAgent(postReq('http://localhost/api/agents', {}));
    expect(res.status).toBe(201);
    const body = await json<{ id: string; status: string; spendLimits: object }>(res);
    expect(body.id).toBe('a1');
    expect(body.status).toBe('active');
    expect(body.spendLimits).toBeDefined();
    expect(mockAgentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          walletAddress: WALLET,
        }),
      })
    );
  });

  // Step 3 ── Create DCA strategy → 201, chainId=480
  it('step 3: POST /api/agents/[id]/strategies returns strategy with chainId=480', async () => {
    const res = await postStrategy(
      postReq('http://localhost/api/agents/a1/strategies', {
        name: 'Daily DCA', tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT,
        amountPerInterval: '1000000', interval: 'daily',
      }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(201);
    const body = await json<{ agentId: string; chainId: number; tokenIn: string }>(res);
    expect(body.agentId).toBe('a1');
    expect(body.chainId).toBe(480);
    expect(body.tokenIn).toBe(TOKEN_IN);
  });

  // Step 4 ── Fetch pending proposals → returns proposal list
  it('step 4: GET /api/agents/[id]/proposals?status=pending returns proposal array', async () => {
    const res = await getProposals(
      new Request('http://localhost/api/agents/a1/proposals?status=pending'),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(200);
    const body = await json<Array<{ id: string; status: string; tokenIn: string; amount: string }>>(res);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe('p1');
    expect(body[0].status).toBe('pending');
    expect(body[0].tokenIn).toBe(TOKEN_IN);
    expect(body[0].amount).toBe('1000000');
  });

  // Step 5 ── Approve proposal → executes swap, persists execution
  it('step 5: POST /api/agents/[id]/approve returns success=true with txHash', async () => {
    const res = await approveHandler(
      postReq('http://localhost/api/agents/a1/approve', { proposalId: 'p1' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(200);
    const body = await json<{ success: boolean; txHash: string }>(res);
    expect(body.success).toBe(true);
    expect(body.txHash).toBe(TX_HASH);
    expect(mockMarkExecuted).toHaveBeenCalledWith('p1', expect.objectContaining({
      agentId: 'a1', strategyId: 's1', txHash: TX_HASH, status: 'confirmed',
    }));
  });

  // Step 6 ── Fetch execution history → paginated, execution present immediately
  it('step 6: GET /api/executions returns paginated history with the execution', async () => {
    const res = await getExecutions(
      new Request('http://localhost/api/executions?agentId=a1')
    );
    expect(res.status).toBe(200);
    const body = await json<{ data: Array<{ id: string; txHash: string; status: string; executedAt: string }>; nextCursor: string | null }>(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect('nextCursor' in body).toBe(true);
    const exec = body.data[0];
    expect(exec.id).toBe('exec-1');
    expect(exec.txHash).toBe(TX_HASH);
    expect(exec.status).toBe('confirmed');
    expect(typeof exec.executedAt).toBe('string'); // ISO string
  });

  // ── Security: unauthorized access is rejected at every gate step ────────────

  it('rejects all guarded routes with 401 when session is missing', async () => {
    mockGetSession.mockRejectedValue(new AuthError('Unauthorized', 401));

    const results = await Promise.all([
      postAgent(postReq('http://localhost/api/agents', {})),
      postStrategy(
        postReq('http://localhost/api/agents/a1/strategies', { name: 'x', tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT, amountPerInterval: '1', interval: 'daily' }),
        { params: Promise.resolve({ id: 'a1' }) }
      ),
      getProposals(new Request('http://localhost/api/agents/a1/proposals'), { params: Promise.resolve({ id: 'a1' }) }),
      approveHandler(postReq('http://localhost/api/agents/a1/approve', { proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) }),
      getExecutions(new Request('http://localhost/api/executions?agentId=a1')),
    ]);

    for (const res of results) {
      expect(res.status).toBe(401);
    }
  });

  // ── Security: cross-user access is rejected (another user's agent) ──────────

  it('rejects all agent-scoped routes with 404 when agent belongs to another user', async () => {
    mockAgentFindUnique.mockResolvedValue({ ...dbAgent, ownerId: 'other-user' } as never);
    mockProposalFindUnique.mockResolvedValue({
      ...dbProposal,
      agent: { ...dbAgent, ownerId: 'other-user' },
    } as never);

    const agentParams = { params: Promise.resolve({ id: 'a1' }) };

    const results = await Promise.all([
      postStrategy(
        postReq('http://localhost/api/agents/a1/strategies', { name: 'x', tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT, amountPerInterval: '1', interval: 'daily' }),
        agentParams
      ),
      getProposals(new Request('http://localhost/api/agents/a1/proposals'), agentParams),
      approveHandler(postReq('http://localhost/api/agents/a1/approve', { proposalId: 'p1' }), agentParams),
      getExecutions(new Request('http://localhost/api/executions?agentId=a1')),
    ]);

    for (const res of results) {
      expect(res.status).toBe(404);
    }
  });

  // ── Proposal state machine: cannot double-approve ───────────────────────────

  it('returns 409 when approving an already-executed proposal', async () => {
    mockProposalFindUnique.mockResolvedValue({ ...dbProposal, status: 'executed' } as never);
    const res = await approveHandler(
      postReq('http://localhost/api/agents/a1/approve', { proposalId: 'p1' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(409);
    expect(mockSwap).not.toHaveBeenCalled();
  });

  it('returns 409 on concurrent approve (optimistic lock — count=0)', async () => {
    mockProposalUpdateMany.mockResolvedValue({ count: 0 } as never);
    const res = await approveHandler(
      postReq('http://localhost/api/agents/a1/approve', { proposalId: 'p1' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(409);
    expect(mockSwap).not.toHaveBeenCalled();
    expect(mockMarkExecuted).not.toHaveBeenCalled();
  });

  it('rolls back proposal to pending and returns 400 when swap fails', async () => {
    mockSwap.mockResolvedValue({ success: false, error: 'No liquidity', amountIn: '0', amountOut: '0' } as never);
    const res = await approveHandler(
      postReq('http://localhost/api/agents/a1/approve', { proposalId: 'p1' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(400);
    expect(mockProposalUpdate).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'pending' } });
    expect(mockMarkExecuted).not.toHaveBeenCalled();
  });

  // ── Gate ordering: strategy cannot be created before agent is active ────────

  it('blocks strategy creation while agent is still registering', async () => {
    mockAgentFindUnique.mockResolvedValue({ ...dbAgent, status: 'registering' } as never);
    const res = await postStrategy(
      postReq('http://localhost/api/agents/a1/strategies', {
        name: 'Daily DCA', tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT,
        amountPerInterval: '1000000', interval: 'daily',
      }),
      { params: Promise.resolve({ id: 'a1' }) }
    );
    expect(res.status).toBe(409);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('registering');
  });

  // ── Execution history: ordering and shape ───────────────────────────────────

  it('execution history is ordered by executedAt desc', async () => {
    await getExecutions(new Request('http://localhost/api/executions?agentId=a1'));
    expect(mockExecutionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { executedAt: 'desc' } })
    );
  });

  it('execution response includes all fields the frontend consumes', async () => {
    const res = await getExecutions(new Request('http://localhost/api/executions?agentId=a1'));
    const body = await json<{ data: Array<Record<string, unknown>> }>(res);
    const exec = body.data[0];
    expect(exec).toMatchObject({
      id: expect.any(String),
      agentId: expect.any(String),
      strategyId: expect.any(String),
      proposalId: expect.any(String),
      txHash: expect.stringMatching(/^0x/),
      amountIn: expect.any(String),
      amountOut: expect.any(String),
      status: expect.any(String),
      executedAt: expect.any(String),
    });
  });
});
