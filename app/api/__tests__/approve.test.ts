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

vi.mock('@/lib/auth', () => ({
  getSessionUserId: vi.fn(),
  AuthError: class AuthError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    proposal: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/agent-service', () => ({
  markProposalExecuted: vi.fn(),
}));

vi.mock('@/services/uniswap', () => ({
  executeSwap: vi.fn(),
}));

import { POST } from '@/app/api/agents/[id]/approve/route';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { markProposalExecuted } from '@/lib/agent-service';
import { executeSwap } from '@/services/uniswap';

const mockGetSession = vi.mocked(getSessionUserId);
const mockFindUnique = vi.mocked(db.proposal.findUnique);
const mockUpdateMany = vi.mocked(db.proposal.updateMany);
const mockUpdate = vi.mocked(db.proposal.update);
const mockMarkExecuted = vi.mocked(markProposalExecuted);
const mockSwap = vi.mocked(executeSwap);

const TX = '0x' + 'f'.repeat(64);
const now = new Date();
const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';

const activeAgent = {
  id: 'a1', ownerId: 'u1', walletAddress: '0x' + 'a'.repeat(40),
  status: 'active', spendLimits: { maxPerTx: '2000000000', dailyCap: '10000000000' },
  createdAt: now,
};
const pendingProposal = {
  id: 'p1', agentId: 'a1', strategyId: 's1', type: 'dca_buy',
  tokenIn: WETH, tokenOut: USDC,
  amount: '1000000000000000000', estimatedOutput: '900000000',
  reasoning: 'DCA', status: 'pending', createdAt: now,
  agent: activeAgent,
};

function req(body: unknown): Request {
  return new Request('http://localhost/api/agents/a1/approve', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
async function json<T>(res: Response): Promise<T> { return res.json() as Promise<T>; }

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue('u1' as never);
  mockFindUnique.mockResolvedValue(pendingProposal as never);
  mockUpdateMany.mockResolvedValue({ count: 1 } as never);
  mockSwap.mockResolvedValue({
    success: true, txHash: TX, amountIn: '1000000000000000000', amountOut: '900000000',
  } as never);
  mockMarkExecuted.mockResolvedValue(undefined as never);
});

describe('POST /api/agents/[id]/approve', () => {
  it('returns 200 with success=true on success', async () => {
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(200);
    const data = await json<{ success: boolean }>(res);
    expect(data.success).toBe(true);
  });

  it('calls markProposalExecuted with correct fields', async () => {
    await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(mockMarkExecuted).toHaveBeenCalledWith('p1', expect.objectContaining({
      agentId: 'a1', strategyId: 's1', txHash: TX, status: 'confirmed',
    }));
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockRejectedValue(new AuthError('Unauthorized', 401));
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 400 when proposalId is missing', async () => {
    const res = await POST(req({}), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when proposal not found', async () => {
    mockFindUnique.mockResolvedValue(null as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(404);
  });

  it('returns 404 when proposal belongs to a different agent', async () => {
    mockFindUnique.mockResolvedValue({ ...pendingProposal, agentId: 'other-agent' } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(404);
  });

  it('returns 404 when agent belongs to a different user', async () => {
    mockFindUnique.mockResolvedValue({
      ...pendingProposal,
      agent: { ...activeAgent, ownerId: 'other-user' },
    } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(404);
  });

  it('returns 409 when proposal is not pending', async () => {
    mockFindUnique.mockResolvedValue({ ...pendingProposal, status: 'executed' } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(409);
  });

  it('returns 409 when agent is paused', async () => {
    mockFindUnique.mockResolvedValue({
      ...pendingProposal,
      agent: { ...activeAgent, status: 'paused' },
    } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(409);
  });

  it('returns 400 when WETH proposal notional exceeds maxPerTx spend limit', async () => {
    mockFindUnique.mockResolvedValue({
      ...pendingProposal,
      estimatedOutput: '1250000000',
      agent: { ...activeAgent, spendLimits: { maxPerTx: '1000000000' } },
    } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(400);
    const data = await json<{ error: string }>(res);
    expect(data.error).toContain('maxPerTx');
    expect(data.error).toContain('$1250');
    expect(data.error).toContain('$1000');
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('returns 400 when USDC input amount exceeds maxPerTx spend limit', async () => {
    mockFindUnique.mockResolvedValue({
      ...pendingProposal,
      tokenIn: USDC,
      tokenOut: WETH,
      amount: '1500000000',
      estimatedOutput: '800000000000000000',
      agent: { ...activeAgent, spendLimits: { maxPerTx: '1000000000' } },
    } as never);

    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(400);
    const data = await json<{ error: string }>(res);
    expect(data.error).toContain('$1500');
  });

  it('returns 409 on race condition (optimistic lock returns count=0)', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(409);
    expect(mockSwap).not.toHaveBeenCalled();
  });

  it('rolls back to pending and returns 400 when swap fails', async () => {
    mockSwap.mockResolvedValue({
      success: false, error: 'Insufficient liquidity', amountIn: '1000000000000000000', amountOut: '0',
    } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(400);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'pending' },
    });
    expect(mockMarkExecuted).not.toHaveBeenCalled();
  });

  it('does not enforce spend limit when maxPerTx is unset', async () => {
    mockFindUnique.mockResolvedValue({
      ...pendingProposal,
      agent: { ...activeAgent, spendLimits: {} },
    } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(200);
  });

  it('treats legacy default spend limits as $1,000 / $5,000 caps', async () => {
    mockFindUnique.mockResolvedValue({
      ...pendingProposal,
      agent: { ...activeAgent, spendLimits: { maxPerTx: '1000000', dailyCap: '5000000' } },
    } as never);

    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(200);
  });
});
