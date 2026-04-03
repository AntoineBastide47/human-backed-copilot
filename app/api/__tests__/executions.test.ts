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
    agent: { findUnique: vi.fn() },
    execution: { findMany: vi.fn() },
  },
}));

import { GET } from '@/app/api/executions/route';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';

const mockGetSession = vi.mocked(getSessionUserId);
const mockAgentFindUnique = vi.mocked(db.agent.findUnique);
const mockExecutionFindMany = vi.mocked(db.execution.findMany);

const now = new Date();
const dbAgent = {
  id: 'a1', ownerId: 'u1', walletAddress: '0x' + 'a'.repeat(40),
  status: 'active', usageCount: 0, freeTrialRemaining: 3,
  spendLimits: {}, ensName: null, agentbookRegId: null, createdAt: now,
};

function makeExecution(n: number) {
  return {
    id: `exec-${n}`, agentId: 'a1', strategyId: 's1', proposalId: `prop-${n}`,
    txHash: '0x' + String(n).padStart(64, '0'),
    amountIn: '1000', amountOut: '900', status: 'confirmed',
    executedAt: new Date(now.getTime() - n * 60_000),
  };
}

function req(url: string): Request {
  return new Request(url);
}
async function json<T>(res: Response): Promise<T> { return res.json() as Promise<T>; }

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue('u1' as never);
  mockAgentFindUnique.mockResolvedValue(dbAgent as never);
  mockExecutionFindMany.mockResolvedValue([makeExecution(1), makeExecution(2)] as never);
});

describe('GET /api/executions', () => {
  it('returns 401 when no session', async () => {
    mockGetSession.mockRejectedValue(new AuthError('Unauthorized', 401));
    const res = await GET(req('http://localhost/api/executions?agentId=a1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when agentId is missing', async () => {
    const res = await GET(req('http://localhost/api/executions'));
    expect(res.status).toBe(400);
    const data = await json<{ error: string }>(res);
    expect(data.error).toContain('agentId');
  });

  it('returns 404 when agent not found', async () => {
    mockAgentFindUnique.mockResolvedValue(null as never);
    const res = await GET(req('http://localhost/api/executions?agentId=a1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when agent belongs to a different user', async () => {
    mockAgentFindUnique.mockResolvedValue({ ...dbAgent, ownerId: 'other' } as never);
    const res = await GET(req('http://localhost/api/executions?agentId=a1'));
    expect(res.status).toBe(404);
  });

  it('returns paginated data with executedAt desc order', async () => {
    const res = await GET(req('http://localhost/api/executions?agentId=a1'));
    expect(res.status).toBe(200);
    expect(mockExecutionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { executedAt: 'desc' } })
    );
    const body = await json<{ data: unknown[]; nextCursor: string | null }>(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect('nextCursor' in body).toBe(true);
  });

  it('nextCursor is null when fewer results than limit', async () => {
    mockExecutionFindMany.mockResolvedValue([makeExecution(1)] as never);
    const res = await GET(req('http://localhost/api/executions?agentId=a1&limit=20'));
    const body = await json<{ nextCursor: string | null }>(res);
    expect(body.nextCursor).toBeNull();
  });

  it('nextCursor is set when more results exist', async () => {
    // Return limit+1 rows to signal more pages
    const rows = Array.from({ length: 21 }, (_, i) => makeExecution(i + 1));
    mockExecutionFindMany.mockResolvedValue(rows as never);
    const res = await GET(req('http://localhost/api/executions?agentId=a1&limit=20'));
    const body = await json<{ data: unknown[]; nextCursor: string | null }>(res);
    expect(body.data).toHaveLength(20);
    expect(body.nextCursor).toBe('exec-20');
  });

  it('passes cursor to DB query when provided', async () => {
    mockExecutionFindMany.mockResolvedValue([] as never);
    await GET(req('http://localhost/api/executions?agentId=a1&cursor=exec-5'));
    expect(mockExecutionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'exec-5' },
        skip: 1,
      })
    );
  });

  it('respects limit query param (capped at 100)', async () => {
    mockExecutionFindMany.mockResolvedValue([] as never);
    await GET(req('http://localhost/api/executions?agentId=a1&limit=200'));
    const call = mockExecutionFindMany.mock.calls[0][0] as { take: number };
    expect(call.take).toBe(101); // 100 + 1 for hasMore detection
  });

  it('uses default limit of 20 when not specified', async () => {
    mockExecutionFindMany.mockResolvedValue([] as never);
    await GET(req('http://localhost/api/executions?agentId=a1'));
    const call = mockExecutionFindMany.mock.calls[0][0] as { take: number };
    expect(call.take).toBe(21);
  });

  it('each execution has correct mapped fields', async () => {
    const res = await GET(req('http://localhost/api/executions?agentId=a1'));
    const body = await json<{ data: Array<Record<string, unknown>> }>(res);
    for (const exec of body.data) {
      expect(exec).toMatchObject({
        id: expect.any(String),
        agentId: expect.any(String),
        txHash: expect.stringMatching(/^0x/),
        status: expect.any(String),
        executedAt: expect.any(String),
      });
    }
  });
});
