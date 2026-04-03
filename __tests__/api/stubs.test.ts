import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock next/server so route handlers run outside the Next.js runtime
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      }),
  },
}));

function req(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

async function json<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

// ── /api/agents ──────────────────────────────────────────────────────────────

describe('GET /api/agents', () => {
  it('returns 200 array of agents', async () => {
    const { GET } = await import('@/app/api/agents/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await json<unknown[]>(res);
    expect(Array.isArray(data)).toBe(true);
    const agent = data[0] as Record<string, unknown>;
    expect(agent).toMatchObject({
      id: expect.any(String),
      ownerId: expect.any(String),
      walletAddress: expect.any(String),
      status: expect.any(String),
      usageCount: expect.any(Number),
      freeTrialRemaining: expect.any(Number),
      spendLimits: expect.objectContaining({ maxPerTx: expect.any(String) }),
      createdAt: expect.any(String),
    });
  });

  it('POST returns 201 with registering status', async () => {
    const { POST } = await import('@/app/api/agents/route');
    const res = await POST();
    expect(res.status).toBe(201);
    const agent = await json<{ status: string }>(res);
    expect(agent.status).toBe('registering');
  });
});

// ── /api/agents/[id] ─────────────────────────────────────────────────────────

describe('GET /api/agents/[id]', () => {
  it('returns agent with correct id', async () => {
    const { GET } = await import('@/app/api/agents/[id]/route');
    const res = await GET(req('http://localhost/api/agents/test-id'), {
      params: Promise.resolve({ id: 'test-id' }),
    });
    expect(res.status).toBe(200);
    const agent = await json<{ id: string }>(res);
    expect(agent.id).toBe('test-id');
  });
});

// ── /api/agents/[id]/strategies ──────────────────────────────────────────────

describe('GET /api/agents/[id]/strategies', () => {
  it('returns array of strategies', async () => {
    const { GET } = await import('@/app/api/agents/[id]/strategies/route');
    const res = await GET(req('http://localhost/api/agents/test-id/strategies'), {
      params: Promise.resolve({ id: 'test-id' }),
    });
    const data = await json<unknown[]>(res);
    expect(Array.isArray(data)).toBe(true);
    const strat = data[0] as Record<string, unknown>;
    expect(strat).toMatchObject({
      id: expect.any(String),
      agentId: 'test-id',
      tokenIn: expect.any(String),
      tokenOut: expect.any(String),
      chainId: 480,
      interval: expect.any(String),
    });
  });

  it('POST returns 201 strategy', async () => {
    const { POST } = await import('@/app/api/agents/[id]/strategies/route');
    const res = await POST(req('http://localhost/api/agents/test-id/strategies', { method: 'POST' }), {
      params: Promise.resolve({ id: 'test-id' }),
    });
    expect(res.status).toBe(201);
    const strat = await json<{ agentId: string; chainId: number }>(res);
    expect(strat.agentId).toBe('test-id');
    expect(strat.chainId).toBe(480);
  });
});

// ── /api/agents/[id]/proposals ───────────────────────────────────────────────

describe('GET /api/agents/[id]/proposals', () => {
  it('returns all proposals when no status filter', async () => {
    const { GET } = await import('@/app/api/agents/[id]/proposals/route');
    const res = await GET(req('http://localhost/api/agents/test-id/proposals'), {
      params: Promise.resolve({ id: 'test-id' }),
    });
    const data = await json<unknown[]>(res);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('filters by ?status=pending', async () => {
    const { GET } = await import('@/app/api/agents/[id]/proposals/route');
    const res = await GET(req('http://localhost/api/agents/test-id/proposals?status=pending'), {
      params: Promise.resolve({ id: 'test-id' }),
    });
    const data = await json<Array<{ status: string }>>(res);
    expect(data.every((p) => p.status === 'pending')).toBe(true);
  });

  it('returns empty array for status=approved (no stubs)', async () => {
    const { GET } = await import('@/app/api/agents/[id]/proposals/route');
    const res = await GET(req('http://localhost/api/agents/test-id/proposals?status=approved'), {
      params: Promise.resolve({ id: 'test-id' }),
    });
    const data = await json<unknown[]>(res);
    expect(data).toEqual([]);
  });

  it('injects agentId from route param', async () => {
    const { GET } = await import('@/app/api/agents/[id]/proposals/route');
    const res = await GET(req('http://localhost/api/agents/my-agent/proposals'), {
      params: Promise.resolve({ id: 'my-agent' }),
    });
    const data = await json<Array<{ agentId: string }>>(res);
    expect(data.every((p) => p.agentId === 'my-agent')).toBe(true);
  });
});

// ── /api/agents/[id]/approve ─────────────────────────────────────────────────

describe('POST /api/agents/[id]/approve', () => {
  it('returns success and a txHash', async () => {
    const { POST } = await import('@/app/api/agents/[id]/approve/route');
    const res = await POST(req('http://localhost/api/agents/test-id/approve', { method: 'POST' }), {
      params: Promise.resolve({ id: 'test-id' }),
    });
    expect(res.status).toBe(200);
    const data = await json<{ success: boolean; txHash: string }>(res);
    expect(data.success).toBe(true);
    expect(data.txHash).toMatch(/^0x/);
  });
});

// ── /api/agents/[id]/reject ──────────────────────────────────────────────────

describe('POST /api/agents/[id]/reject', () => {
  it('returns success', async () => {
    const { POST } = await import('@/app/api/agents/[id]/reject/route');
    const res = await POST(req('http://localhost/api/agents/test-id/reject', { method: 'POST' }), {
      params: Promise.resolve({ id: 'test-id' }),
    });
    expect(res.status).toBe(200);
    const data = await json<{ success: boolean }>(res);
    expect(data.success).toBe(true);
  });
});

// ── /api/executions ──────────────────────────────────────────────────────────

describe('GET /api/executions', () => {
  it('returns all executions without filter', async () => {
    const { GET } = await import('@/app/api/executions/route');
    const res = await GET(req('http://localhost/api/executions'));
    const data = await json<unknown[]>(res);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('filters by ?agentId', async () => {
    const { GET } = await import('@/app/api/executions/route');
    const res = await GET(req('http://localhost/api/executions?agentId=stub-agent-1'));
    const data = await json<Array<{ agentId: string }>>(res);
    expect(data.every((e) => e.agentId === 'stub-agent-1')).toBe(true);
  });

  it('returns empty array for unknown agentId', async () => {
    const { GET } = await import('@/app/api/executions/route');
    const res = await GET(req('http://localhost/api/executions?agentId=nonexistent'));
    const data = await json<unknown[]>(res);
    expect(data).toEqual([]);
  });

  it('each execution has required fields', async () => {
    const { GET } = await import('@/app/api/executions/route');
    const res = await GET(req('http://localhost/api/executions'));
    const data = await json<Array<Record<string, unknown>>>(res);
    for (const exec of data) {
      expect(exec).toMatchObject({
        id: expect.any(String),
        agentId: expect.any(String),
        strategyId: expect.any(String),
        txHash: expect.stringMatching(/^0x/),
        amountIn: expect.any(String),
        amountOut: expect.any(String),
        status: expect.any(String),
        executedAt: expect.any(String),
      });
    }
  });
});
