import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifyAgentkitRequest = vi.fn();
const mockExecuteSwap = vi.fn();

vi.mock('@/services/agentkit', () => ({
  verifyAgentkitRequest: (...args: unknown[]) => mockVerifyAgentkitRequest(...args),
}));

vi.mock('@/services/uniswap', () => ({
  executeSwap: (...args: unknown[]) => mockExecuteSwap(...args),
}));

describe('POST /api/agent/execute-trade', () => {
  beforeEach(() => {
    mockVerifyAgentkitRequest.mockReset();
    mockExecuteSwap.mockReset();
  });

  async function callRoute(body?: unknown, headers?: Record<string, string>) {
    const { POST } = await import('@/app/api/agent/execute-trade/route');
    const init: RequestInit = { method: 'POST', headers: headers ?? {} };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers = { ...init.headers, 'Content-Type': 'application/json' };
    }
    const req = new Request('https://example.com/api/agent/execute-trade', init);
    return POST(req);
  }

  it('returns 402 when agentkit verification fails with no header', async () => {
    mockVerifyAgentkitRequest.mockResolvedValue({
      granted: false,
      status: 402,
      body: { error: 'Payment Required' },
    });

    const res = await callRoute({ tokenIn: '0x1', tokenOut: '0x2', chainId: 480, amount: '100' });
    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.error).toBe('Payment Required');
  });

  it('returns 403 when agentkit verification rejects agent', async () => {
    mockVerifyAgentkitRequest.mockResolvedValue({
      granted: false,
      status: 403,
      body: { error: 'Agent not registered in AgentBook' },
    });

    const res = await callRoute({ tokenIn: '0x1', tokenOut: '0x2', chainId: 480, amount: '100' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid JSON body', async () => {
    mockVerifyAgentkitRequest.mockResolvedValue({ granted: true });

    const { POST } = await import('@/app/api/agent/execute-trade/route');
    const req = new Request('https://example.com/api/agent/execute-trade', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'text/plain' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid JSON body');
  });

  it('returns 400 when required fields are missing', async () => {
    mockVerifyAgentkitRequest.mockResolvedValue({ granted: true });

    const res = await callRoute({ tokenIn: '0xabc' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Missing required fields/);
  });

  it('returns 200 with swap result on success', async () => {
    mockVerifyAgentkitRequest.mockResolvedValue({ granted: true });
    mockExecuteSwap.mockResolvedValue({
      success: true,
      txHash: '0xdeadbeef',
      amountIn: '1000',
      amountOut: '500',
    });

    const res = await callRoute({
      tokenIn: '0x4200000000000000000000000000000000000006',
      tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
      chainId: 480,
      amount: '1000',
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.txHash).toBe('0xdeadbeef');
  });

  it('returns 502 after MAX_RETRIES exhausted', async () => {
    vi.useFakeTimers();
    mockVerifyAgentkitRequest.mockResolvedValue({ granted: true });
    mockExecuteSwap.mockResolvedValue({
      success: false,
      amountIn: '1000',
      amountOut: '0',
      error: 'Reverted',
    });

    const resPromise = callRoute({
      tokenIn: '0x4200000000000000000000000000000000000006',
      tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
      chainId: 480,
      amount: '1000',
    });

    // Advance past retry delays (5s + 10s)
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(10_000);

    const res = await resPromise;
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/3 attempts/);
    expect(mockExecuteSwap).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
