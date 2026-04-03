import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { SwapRequest } from '@/types';

// Mock wallet module
vi.mock('../wallet', () => ({
  getWalletClient: vi.fn(() => ({
    account: { address: '0x1111111111111111111111111111111111111111' },
    signTypedData: vi.fn().mockResolvedValue('0xsignature'),
    sendTransaction: vi.fn().mockResolvedValue('0xtxhash'),
  })),
  getPublicClient: vi.fn(() => ({
    waitForTransactionReceipt: vi.fn().mockResolvedValue({
      status: 'success',
      gasUsed: 21000n,
    }),
  })),
}));

const VALID_TOKEN_A = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const VALID_TOKEN_B = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';

const validRequest: SwapRequest = {
  tokenIn: VALID_TOKEN_A,
  tokenOut: VALID_TOKEN_B,
  chainId: 480,
  amount: '1000000',
};

describe('validateSwapRequest', () => {
  let validateSwapRequest: typeof import('../uniswap').validateSwapRequest;

  beforeEach(async () => {
    vi.resetModules();
    process.env.UNISWAP_API_KEY = 'test-key';
    process.env.WORLD_CHAIN_RPC = 'https://rpc.example.com';
    process.env.WALLET_PRIVATE_KEY = '0x' + 'ab'.repeat(32);
    ({ validateSwapRequest } = await import('../uniswap'));
  });

  it('accepts valid request', () => {
    expect(() => validateSwapRequest(validRequest)).not.toThrow();
  });

  it('rejects invalid tokenIn address', () => {
    expect(() => validateSwapRequest({ ...validRequest, tokenIn: 'bad' })).toThrow('Invalid tokenIn');
  });

  it('rejects invalid tokenOut address', () => {
    expect(() => validateSwapRequest({ ...validRequest, tokenOut: '0xZZZ' })).toThrow('Invalid tokenOut');
  });

  it('rejects same tokenIn and tokenOut', () => {
    expect(() =>
      validateSwapRequest({ ...validRequest, tokenOut: VALID_TOKEN_A }),
    ).toThrow('must differ');
  });

  it('rejects same tokens case-insensitively', () => {
    expect(() =>
      validateSwapRequest({ ...validRequest, tokenOut: VALID_TOKEN_A.toLowerCase() }),
    ).toThrow('must differ');
  });

  it('rejects zero amount', () => {
    expect(() => validateSwapRequest({ ...validRequest, amount: '0' })).toThrow('Invalid amount');
  });

  it('rejects negative amount', () => {
    expect(() => validateSwapRequest({ ...validRequest, amount: '-100' })).toThrow('Invalid amount');
  });

  it('rejects non-numeric amount', () => {
    expect(() => validateSwapRequest({ ...validRequest, amount: 'abc' })).toThrow();
  });

  it('rejects unsupported chainId', () => {
    expect(() => validateSwapRequest({ ...validRequest, chainId: 1 })).toThrow('Unsupported chainId');
  });
});

describe('isValidAddress', () => {
  let isValidAddress: typeof import('../uniswap').isValidAddress;

  beforeEach(async () => {
    vi.resetModules();
    process.env.UNISWAP_API_KEY = 'test-key';
    process.env.WORLD_CHAIN_RPC = 'https://rpc.example.com';
    process.env.WALLET_PRIVATE_KEY = '0x' + 'ab'.repeat(32);
    ({ isValidAddress } = await import('../uniswap'));
  });

  it.each([
    ['0x1234567890abcdef1234567890ABCDEF12345678', true],
    ['0x' + 'a'.repeat(40), true],
    ['0x' + 'A'.repeat(40), true],
    ['0x' + '0'.repeat(40), true],
    ['', false],
    ['0x', false],
    ['0x' + 'g'.repeat(40), false],
    ['0x' + 'a'.repeat(39), false],
    ['0x' + 'a'.repeat(41), false],
    ['a'.repeat(40), false],
  ])('isValidAddress(%s) → %s', (addr, expected) => {
    expect(isValidAddress(addr)).toBe(expected);
  });
});

describe('getQuote', () => {
  let getQuote: typeof import('../uniswap').getQuote;

  beforeEach(async () => {
    vi.resetModules();
    process.env.UNISWAP_API_KEY = 'test-key';
    process.env.WORLD_CHAIN_RPC = 'https://rpc.example.com';
    process.env.WALLET_PRIVATE_KEY = '0x' + 'ab'.repeat(32);
    ({ getQuote } = await import('../uniswap'));
  });

  it('throws if UNISWAP_API_KEY is missing', async () => {
    delete process.env.UNISWAP_API_KEY;
    vi.resetModules();
    const mod = await import('../uniswap');
    await expect(mod.getQuote(validRequest)).rejects.toThrow('UNISWAP_API_KEY is not set');
  });

  it('returns quote on success', async () => {
    const mockQuote = { quoteDecimals: '500000', gasUseEstimate: '150000' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ quote: mockQuote }),
      }),
    );

    const result = await getQuote(validRequest);
    expect(result.quote).toEqual(mockQuote);
    expect(result.permitData).toBeUndefined();
    expect(result.gasEstimate).toBe('150000');
  });

  it('returns permitData when present', async () => {
    const mockPermitData = { domain: {}, types: {}, values: {} };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ quote: {}, permitData: mockPermitData }),
      }),
    );

    const result = await getQuote(validRequest);
    expect(result.permitData).toEqual(mockPermitData);
  });

  it('does not return permitData when null from API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ quote: {}, permitData: null }),
      }),
    );

    const result = await getQuote(validRequest);
    expect(result.permitData).toBeUndefined();
  });

  it('surfaces txFailureReason from API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ quote: {}, txFailureReason: 'INSUFFICIENT_BALANCE' }),
      }),
    );

    const result = await getQuote(validRequest);
    expect(result.txFailureReason).toBe('INSUFFICIENT_BALANCE');
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limited'),
      }),
    );

    await expect(getQuote(validRequest)).rejects.toThrow('Uniswap quote failed (429)');
  });

  it('sends correct headers including x-universal-router-version', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ quote: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getQuote(validRequest);

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['x-universal-router-version']).toBe('2.0');
    expect(options.headers['x-api-key']).toBe('test-key');
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('sends autoSlippage DEFAULT when no slippage specified', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ quote: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getQuote(validRequest);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.autoSlippage).toBe('DEFAULT');
    expect(body.slippageTolerance).toBeUndefined();
  });

  it('sends slippageTolerance when specified', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ quote: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getQuote({ ...validRequest, slippage: '0.5' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.slippageTolerance).toBe('0.5');
    expect(body.autoSlippage).toBeUndefined();
  });
});

describe('executeSwap', () => {
  let executeSwap: typeof import('../uniswap').executeSwap;
  let getWalletClient: Mock;
  let getPublicClient: Mock;

  const mockSignTypedData = vi.fn().mockResolvedValue('0xsig123');
  const mockSendTransaction = vi.fn().mockResolvedValue('0xtxhash123');
  const mockWaitForReceipt = vi.fn().mockResolvedValue({ status: 'success', gasUsed: 50000n });

  beforeEach(async () => {
    vi.resetModules();
    process.env.UNISWAP_API_KEY = 'test-key';
    process.env.WORLD_CHAIN_RPC = 'https://rpc.example.com';
    process.env.WALLET_PRIVATE_KEY = '0x' + 'ab'.repeat(32);

    const walletMod = await import('../wallet');
    getWalletClient = walletMod.getWalletClient as Mock;
    getPublicClient = walletMod.getPublicClient as Mock;

    getWalletClient.mockReturnValue({
      account: { address: '0x1111111111111111111111111111111111111111' },
      signTypedData: mockSignTypedData,
      sendTransaction: mockSendTransaction,
    });
    getPublicClient.mockReturnValue({
      waitForTransactionReceipt: mockWaitForReceipt,
    });

    mockSignTypedData.mockClear();
    mockSendTransaction.mockClear();
    mockWaitForReceipt.mockClear();

    ({ executeSwap } = await import('../uniswap'));
  });

  it('returns success on full swap flow', async () => {
    const quoteResponse = {
      quote: { quoteDecimals: '500000', gasUseEstimate: '150000' },
    };
    const swapResponse = {
      swap: {
        data: '0xcalldata',
        to: '0x2222222222222222222222222222222222222222',
        from: '0x1111111111111111111111111111111111111111',
        value: '0',
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(quoteResponse) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(swapResponse) }),
    );

    const result = await executeSwap(validRequest);
    expect(result.success).toBe(true);
    expect(result.txHash).toBe('0xtxhash123');
    expect(result.amountIn).toBe(validRequest.amount);
    expect(result.gasUsed).toBe('50000');
  });

  it('signs permit2 when permitData present', async () => {
    const permitData = {
      domain: { name: 'Permit2' },
      types: { PermitSingle: [] },
      values: { spender: '0x00' },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ quote: {}, permitData }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              swap: { data: '0xdata', to: '0x' + '2'.repeat(40), from: '0x' + '1'.repeat(40) },
            }),
        }),
    );

    await executeSwap(validRequest);

    expect(mockSignTypedData).toHaveBeenCalledWith({
      domain: permitData.domain,
      types: permitData.types,
      primaryType: 'PermitSingle',
      message: permitData.values,
    });

    // Verify swap body includes both signature and permitData
    const fetchMock = vi.mocked(fetch);
    const swapCall = fetchMock.mock.calls[1];
    const swapBody = JSON.parse(swapCall[1]!.body as string);
    expect(swapBody.signature).toBe('0xsig123');
    expect(swapBody.permitData).toEqual(permitData);
  });

  it('sends neither signature nor permitData when absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ quote: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              swap: { data: '0xdata', to: '0x' + '2'.repeat(40), from: '0x' + '1'.repeat(40) },
            }),
        }),
    );

    await executeSwap(validRequest);

    expect(mockSignTypedData).not.toHaveBeenCalled();

    const fetchMock = vi.mocked(fetch);
    const swapBody = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
    expect(swapBody.signature).toBeUndefined();
    expect(swapBody.permitData).toBeUndefined();
  });

  it('returns failure when quote has txFailureReason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ quote: {}, txFailureReason: 'LOW_LIQUIDITY' }),
      }),
    );

    const result = await executeSwap(validRequest);
    expect(result.success).toBe(false);
    expect(result.error).toBe('LOW_LIQUIDITY');
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it('returns failure on empty swap data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ quote: {} }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ swap: { data: '0x', to: '0x' + '2'.repeat(40), from: '0x' + '1'.repeat(40) } }),
        }),
    );

    const result = await executeSwap(validRequest);
    expect(result.success).toBe(false);
    expect(result.error).toContain('empty swap calldata');
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it('returns failure on missing to/from', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ quote: {} }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ swap: { data: '0xcalldata' } }),
        }),
    );

    const result = await executeSwap(validRequest);
    expect(result.success).toBe(false);
    expect(result.error).toContain('missing to/from');
  });

  it('returns failure on reverted transaction', async () => {
    mockWaitForReceipt.mockResolvedValueOnce({ status: 'reverted', gasUsed: 21000n });

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ quote: {} }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              swap: { data: '0xdata', to: '0x' + '2'.repeat(40), from: '0x' + '1'.repeat(40) },
            }),
        }),
    );

    const result = await executeSwap(validRequest);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Transaction reverted');
    expect(result.txHash).toBe('0xtxhash123');
  });

  it('catches network errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network timeout')));

    const result = await executeSwap(validRequest);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Network timeout');
  });

  it('returns failure for invalid request without crashing', async () => {
    const result = await executeSwap({ ...validRequest, chainId: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported chainId');
  });
});

describe('constants', () => {
  it('WORLD_USDC is correct address', async () => {
    const { WORLD_USDC } = await import('../uniswap');
    expect(WORLD_USDC).toBe('0x79A02482A880bCE3F13e09Da970dC34db4CD24d1');
  });

  it('API_BASE is correct', async () => {
    const { API_BASE } = await import('../uniswap');
    expect(API_BASE).toBe('https://trade-api.gateway.uniswap.org');
  });
});
