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
      update: vi.fn(),
    },
  },
}));

import { POST } from '@/app/api/agents/[id]/reject/route';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';

const mockGetSession = vi.mocked(getSessionUserId);
const mockFindUnique = vi.mocked(db.proposal.findUnique);
const mockUpdate = vi.mocked(db.proposal.update);

const now = new Date();
const pendingProposal = {
  id: 'p1', agentId: 'a1', strategyId: 's1', type: 'dca_buy',
  tokenIn: '0x' + 'b'.repeat(40), tokenOut: '0x' + 'c'.repeat(40),
  amount: '1000', estimatedOutput: '900', reasoning: 'DCA',
  status: 'pending', createdAt: now,
  agent: { id: 'a1', ownerId: 'u1', status: 'active' },
};

function req(body: unknown): Request {
  return new Request('http://localhost/api/agents/a1/reject', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
async function json<T>(res: Response): Promise<T> { return res.json() as Promise<T>; }

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue('u1' as never);
  mockFindUnique.mockResolvedValue(pendingProposal as never);
  mockUpdate.mockResolvedValue({ ...pendingProposal, status: 'rejected' } as never);
});

describe('POST /api/agents/[id]/reject', () => {
  it('returns 200 success', async () => {
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(200);
    expect(await json<{ success: boolean }>(res)).toEqual({ success: true });
  });

  it('updates proposal status to rejected', async () => {
    await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'rejected' },
    });
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
    mockFindUnique.mockResolvedValue({ ...pendingProposal, agentId: 'other' } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(404);
  });

  it('returns 404 when agent belongs to a different user', async () => {
    mockFindUnique.mockResolvedValue({
      ...pendingProposal,
      agent: { ...pendingProposal.agent, ownerId: 'other-user' },
    } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(404);
  });

  it('returns 409 when proposal is already rejected', async () => {
    mockFindUnique.mockResolvedValue({ ...pendingProposal, status: 'rejected' } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 when proposal is already executed', async () => {
    mockFindUnique.mockResolvedValue({ ...pendingProposal, status: 'executed' } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(409);
  });

  it('returns 409 when proposal is approved', async () => {
    mockFindUnique.mockResolvedValue({ ...pendingProposal, status: 'approved' } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(409);
  });
});
