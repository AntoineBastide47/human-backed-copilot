import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMulticall = vi.fn();
vi.mock('../wallet', () => ({
  getPublicClient: () => ({ multicall: mockMulticall }),
  getWalletClient: () => ({ account: { address: '0x' + 'a'.repeat(40) } }),
  getWalletAddress: () => '0x' + 'a'.repeat(40) as `0x${string}`,
}));

vi.mock('@/lib/constants', () => ({
  WORLD_USDC: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
}));

const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';
const WALLET = '0x' + 'a'.repeat(40) as `0x${string}`;

describe('portfolio service', () => {
  beforeEach(() => {
    mockMulticall.mockReset();
  });

  describe('getTokenBalances', () => {
    it('returns balances from multicall results', async () => {
      const { getTokenBalances } = await import('../portfolio');
      mockMulticall.mockResolvedValue([
        { status: 'success', result: BigInt('2000000000000000000') },
        { status: 'success', result: BigInt('5000000000') },
      ]);

      const balances = await getTokenBalances(WALLET, [WETH, USDC]);
      expect(balances.get(WETH.toLowerCase())).toBe(BigInt('2000000000000000000'));
      expect(balances.get(USDC.toLowerCase())).toBe(BigInt('5000000000'));
    });

    it('returns zero for failed multicall results', async () => {
      const { getTokenBalances } = await import('../portfolio');
      mockMulticall.mockResolvedValue([
        { status: 'failure', error: new Error('revert') },
      ]);

      const balances = await getTokenBalances(WALLET, [WETH]);
      expect(balances.get(WETH.toLowerCase())).toBe(BigInt(0));
    });

    it('deduplicates tokens', async () => {
      const { getTokenBalances } = await import('../portfolio');
      mockMulticall.mockResolvedValue([
        { status: 'success', result: BigInt('1000') },
      ]);

      await getTokenBalances(WALLET, [WETH, WETH, WETH]);
      const calls = mockMulticall.mock.calls[0][0].contracts;
      expect(calls).toHaveLength(1);
    });

    it('returns empty map for empty token list', async () => {
      const { getTokenBalances } = await import('../portfolio');
      const balances = await getTokenBalances(WALLET, []);
      expect(balances.size).toBe(0);
      expect(mockMulticall).not.toHaveBeenCalled();
    });
  });

  describe('computeAllocations', () => {
    it('computes allocations in basis points', async () => {
      const { computeAllocations } = await import('../portfolio');
      const usdcValues = new Map<string, bigint>([
        [WETH.toLowerCase(), BigInt('3000000000')], // $3000
        [USDC.toLowerCase(), BigInt('2000000000')], // $2000
      ]);

      const { allocations, totalUsdcValue } = computeAllocations(usdcValues);
      expect(totalUsdcValue).toBe(BigInt('5000000000'));
      expect(allocations[WETH.toLowerCase()]).toBe(6000); // 60%
      expect(allocations[USDC.toLowerCase()]).toBe(4000); // 40%
    });

    it('returns zero allocations when total is zero', async () => {
      const { computeAllocations } = await import('../portfolio');
      const usdcValues = new Map<string, bigint>([
        [WETH.toLowerCase(), BigInt(0)],
        [USDC.toLowerCase(), BigInt(0)],
      ]);

      const { allocations, totalUsdcValue } = computeAllocations(usdcValues);
      expect(totalUsdcValue).toBe(BigInt(0));
      expect(allocations[WETH.toLowerCase()]).toBe(0);
      expect(allocations[USDC.toLowerCase()]).toBe(0);
    });

    it('handles single-token portfolio', async () => {
      const { computeAllocations } = await import('../portfolio');
      const usdcValues = new Map<string, bigint>([
        [USDC.toLowerCase(), BigInt('5000000000')],
      ]);

      const { allocations } = computeAllocations(usdcValues);
      expect(allocations[USDC.toLowerCase()]).toBe(10000); // 100%
    });
  });

  describe('getPortfolioSnapshot', () => {
    it('builds a full snapshot with balances and allocations', async () => {
      const { getPortfolioSnapshot } = await import('../portfolio');
      mockMulticall.mockResolvedValue([
        { status: 'success', result: BigInt('2000000000000000000') },
        { status: 'success', result: BigInt('3000000000') },
      ]);

      const usdcValues = new Map<string, bigint>([
        [WETH.toLowerCase(), BigInt('6000000000')],
        [USDC.toLowerCase(), BigInt('3000000000')],
      ]);

      const snapshot = await getPortfolioSnapshot(WALLET, [WETH, USDC], usdcValues);
      expect(snapshot.walletAddress).toBe(WALLET);
      expect(snapshot.balances).toHaveLength(2);
      expect(snapshot.totalUsdcValue).toBe('9000000000');
      expect(snapshot.allocations[WETH.toLowerCase()]).toBe(6666);
      expect(snapshot.allocations[USDC.toLowerCase()]).toBe(3333);
      expect(snapshot.fetchedAt).toBeDefined();
    });
  });

  describe('getTokenDecimals', () => {
    it('returns known decimals for USDC', async () => {
      const { getTokenDecimals } = await import('../portfolio');
      expect(getTokenDecimals(USDC)).toBe(6);
    });

    it('returns known decimals for WETH', async () => {
      const { getTokenDecimals } = await import('../portfolio');
      expect(getTokenDecimals(WETH)).toBe(18);
    });

    it('returns 18 for unknown tokens', async () => {
      const { getTokenDecimals } = await import('../portfolio');
      expect(getTokenDecimals('0x' + '1'.repeat(40))).toBe(18);
    });

    it('is case-insensitive', async () => {
      const { getTokenDecimals } = await import('../portfolio');
      expect(getTokenDecimals(USDC.toLowerCase())).toBe(6);
      expect(getTokenDecimals(USDC.toUpperCase())).toBe(6);
    });
  });
});
