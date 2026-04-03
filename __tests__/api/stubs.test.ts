/**
 * Tests for routes that are still stubs (approve, reject, executions).
 * Routes replaced with real DB logic in H3.5-7 are covered by agents-real.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';

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

// ── /api/agents/[id]/approve ─────────────────────────────────────────────────

describe('POST /api/agents/[id]/approve (stub)', () => {
  it('returns success and a 0x txHash', async () => {
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

describe('POST /api/agents/[id]/reject (stub)', () => {
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

describe('GET /api/executions (stub)', () => {
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
    expect(await json<unknown[]>(res)).toEqual([]);
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
