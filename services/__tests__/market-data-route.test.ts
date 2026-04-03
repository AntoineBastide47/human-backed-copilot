import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifyAgentkitRequest = vi.fn();
const mockGetQuote = vi.fn();

vi.mock('@/services/agentkit', () => ({
  verifyAgentkitRequest: (...args: unknown[]) => mockVerifyAgentkitRequest(...args),
}));

vi.mock('@/services/uniswap', () => ({
  getQuote: (...args: unknown[]) => mockGetQuote(...args),
}));

describe('GET /api/agent/market-data', () => {
  beforeEach(() => {
    mockVerifyAgentkitRequest.mockReset();
    mockGetQuote.mockReset();
  });

  async function callRoute(params?: Record<string, string>) {
    const { GET } = await import('@/app/api/agent/market-data/route');
    const url = new URL('https://example.com/api/agent/market-data');
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const req = new Request(url.toString(), { method: 'GET' });
    return GET(req);
  }

  it('returns 402 when agentkit verification fails', async () => {
    mockVerifyAgentkitRequest.mockResolvedValue({
      granted: false,
      status: 402,
      body: { error: 'Payment Required' },
    });

    const res = await callRoute({
      tokenIn: '0x1',
      tokenOut: '0x2',
      chainId: '480',
      amount: '100',
    });
    expect(res.status).toBe(402);
  });

  it('returns 400 when required params are missing', async () => {
    mockVerifyAgentkitRequest.mockResolvedValue({ granted: true });

    const res = await callRoute({ tokenIn: '0x1' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Missing required query params/);
  });

  it('returns 400 when chainId is not a number', async () => {
    mockVerifyAgentkitRequest.mockResolvedValue({ granted: true });

    const res = await callRoute({
      tokenIn: '0x1',
      tokenOut: '0x2',
      chainId: 'abc',
      amount: '100',
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('chainId must be a number');
  });

  it('returns 200 with quote data on success', async () => {
    mockVerifyAgentkitRequest.mockResolvedValue({ granted: true });
    mockGetQuote.mockResolvedValue({
      quote: { quoteDecimals: '950000', gasUseEstimate: '150000' },
      gasEstimate: '150000',
    });

    const res = await callRoute({
      tokenIn: '0x4200000000000000000000000000000000000006',
      tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
      chainId: '480',
      amount: '1000000000000000000',
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tokenIn).toBe('0x4200000000000000000000000000000000000006');
    expect(data.estimatedOutput).toBe('950000');
    expect(data.gasEstimate).toBe('150000');
  });

  it('returns 502 when quote throws', async () => {
    mockVerifyAgentkitRequest.mockResolvedValue({ granted: true });
    mockGetQuote.mockRejectedValue(new Error('Uniswap API down'));

    const res = await callRoute({
      tokenIn: '0x1',
      tokenOut: '0x2',
      chainId: '480',
      amount: '100',
    });
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe('Uniswap API down');
  });
});
