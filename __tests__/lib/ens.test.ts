import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/constants', () => ({
  ENS_PARENT_NAME: 'provix.eth',
}));

// ── JustaName mock ─────────────────────────────────────────────────────────────
const mockAddSubname = vi.fn();
const mockGetPrimaryNameByAddress = vi.fn();
const mockGetRecords = vi.fn();

vi.mock('@justaname.id/sdk', () => ({
  JustaName: {
    init: vi.fn(() => ({
      subnames: {
        addSubname: mockAddSubname,
        getPrimaryNameByAddress: mockGetPrimaryNameByAddress,
        getRecords: mockGetRecords,
      },
    })),
  },
}));

// ── viem mock (on-chain path) ──────────────────────────────────────────────────
const mockWriteContract = vi.fn();
const mockWaitForTransactionReceipt = vi.fn();

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createWalletClient: vi.fn(() => ({ writeContract: mockWriteContract })),
    createPublicClient: vi.fn(() => ({ waitForTransactionReceipt: mockWaitForTransactionReceipt })),
    http: vi.fn(),
  };
});

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({ address: '0xserver' })),
}));

vi.mock('viem/chains', () => ({
  base: { id: 8453, name: 'Base' },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────
const WALLET = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18';
const WALLET2 = '0xABCDEFabcdef000000000000000000000000ABCD';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.L2_REGISTRAR_ADDRESS;
  delete process.env.SERVER_WALLET_PRIVATE_KEY;
  process.env.MAINNET_RPC = 'https://eth.llamarpc.com';
  process.env.JUSTANAME_API_KEY = 'test-api-key';
});

// ── registerAgentENS ───────────────────────────────────────────────────────────

describe('registerAgentENS', () => {
  it('returns full ENS name with provix.eth suffix', async () => {
    mockAddSubname.mockResolvedValue({});
    const { registerAgentENS } = await import('@/lib/ens');
    const name = await registerAgentENS(WALLET, { strategy: 'dca', worldIdVerified: true, owner: '0xowner' });
    expect(name).toBe('agent-742d35.provix.eth');
  });

  it('derives slug from first 6 hex chars of wallet (lowercased)', async () => {
    mockAddSubname.mockResolvedValue({});
    const { registerAgentENS } = await import('@/lib/ens');
    const name = await registerAgentENS(WALLET2, { strategy: 'dca', worldIdVerified: false, owner: '0xowner' });
    // 0xABCDEF... → slug = agent-abcdef
    expect(name).toBe('agent-abcdef.provix.eth');
  });

  it('calls JustaName addSubname with correct args (offchain path)', async () => {
    mockAddSubname.mockResolvedValue({});
    const { registerAgentENS } = await import('@/lib/ens');
    await registerAgentENS(WALLET, { strategy: 'dca', worldIdVerified: true, owner: '0xowner' });

    expect(mockAddSubname).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'agent-742d35',
        chainId: 1,
        overrideSignatureCheck: true,
        addresses: [{ coinType: '60', address: WALLET }],
        text: expect.arrayContaining([
          { key: 'strategy', value: 'dca' },
          { key: 'worldid',  value: 'verified:orb' },
          { key: 'owner',    value: '0xowner' },
        ]),
      }),
    );
  });

  it('sets worldid=unverified when worldIdVerified is false', async () => {
    mockAddSubname.mockResolvedValue({});
    const { registerAgentENS } = await import('@/lib/ens');
    await registerAgentENS(WALLET, { strategy: 'dca', worldIdVerified: false, owner: '0xowner' });

    expect(mockAddSubname).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.arrayContaining([{ key: 'worldid', value: 'unverified' }]),
      }),
    );
  });

  it('uses on-chain ProvixRegistrar when L2_REGISTRAR_ADDRESS + SERVER_WALLET_PRIVATE_KEY are set', async () => {
    process.env.L2_REGISTRAR_ADDRESS = '0x35bC7e7AcF86F9c25ec7622ceAB63DF1ac32c31a';
    process.env.SERVER_WALLET_PRIVATE_KEY = '0x' + 'ab'.repeat(32);
    mockWriteContract.mockResolvedValue('0xtxhash');
    mockWaitForTransactionReceipt.mockResolvedValue({ status: 'success' });

    const { registerAgentENS } = await import('@/lib/ens');
    const name = await registerAgentENS(WALLET, { strategy: 'dca', worldIdVerified: true, owner: '0xowner' });

    expect(name).toBe('agent-742d35.provix.eth');
    expect(mockWriteContract).toHaveBeenCalled();
    expect(mockAddSubname).not.toHaveBeenCalled();
  });

  it('on-chain call passes correct register() args', async () => {
    process.env.L2_REGISTRAR_ADDRESS = '0x35bC7e7AcF86F9c25ec7622ceAB63DF1ac32c31a';
    process.env.SERVER_WALLET_PRIVATE_KEY = '0x' + 'ab'.repeat(32);
    mockWriteContract.mockResolvedValue('0xtxhash');
    mockWaitForTransactionReceipt.mockResolvedValue({ status: 'success' });

    const { registerAgentENS } = await import('@/lib/ens');
    await registerAgentENS(WALLET, { strategy: 'dca', worldIdVerified: true, owner: '0xowner' });

    expect(mockWriteContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'register',
        args: ['agent-742d35', WALLET, true, '0xowner'],
      }),
    );
  });

  it('falls back to offchain when only L2_REGISTRAR_ADDRESS is set (no private key)', async () => {
    process.env.L2_REGISTRAR_ADDRESS = '0x35bC7e7AcF86F9c25ec7622ceAB63DF1ac32c31a';
    delete process.env.SERVER_WALLET_PRIVATE_KEY;
    mockAddSubname.mockResolvedValue({});

    const { registerAgentENS } = await import('@/lib/ens');
    await registerAgentENS(WALLET, { strategy: 'dca', worldIdVerified: true, owner: '0xowner' });

    expect(mockAddSubname).toHaveBeenCalled();
    expect(mockWriteContract).not.toHaveBeenCalled();
  });
});

// ── resolveAgentName ───────────────────────────────────────────────────────────

describe('resolveAgentName', () => {
  it('returns the ENS name for a known address', async () => {
    mockGetPrimaryNameByAddress.mockResolvedValue({ name: 'agent-742d35.provix.eth' });
    const { resolveAgentName } = await import('@/lib/ens');
    expect(await resolveAgentName(WALLET)).toBe('agent-742d35.provix.eth');
  });

  it('returns null when no primary name is set', async () => {
    mockGetPrimaryNameByAddress.mockResolvedValue({ name: undefined });
    const { resolveAgentName } = await import('@/lib/ens');
    expect(await resolveAgentName(WALLET)).toBeNull();
  });

  it('returns null on network error instead of throwing', async () => {
    mockGetPrimaryNameByAddress.mockRejectedValue(new Error('RPC timeout'));
    const { resolveAgentName } = await import('@/lib/ens');
    expect(await resolveAgentName(WALLET)).toBeNull();
  });
});

// ── lookupAgent ────────────────────────────────────────────────────────────────

describe('lookupAgent', () => {
  it('returns address, strategy, and worldIdVerified for a registered agent', async () => {
    mockGetRecords.mockResolvedValue({
      records: {
        coins: [{ coinType: 60, value: WALLET }],
        texts: [
          { key: 'strategy', value: 'dca' },
          { key: 'worldid',  value: 'verified:orb' },
          { key: 'owner',    value: '0xowner' },
        ],
      },
    });
    const { lookupAgent } = await import('@/lib/ens');
    const result = await lookupAgent('agent-742d35.provix.eth');

    expect(result.address).toBe(WALLET);
    expect(result.strategy).toBe('dca');
    expect(result.worldIdVerified).toBe(true);
  });

  it('returns worldIdVerified=false when worldid record is absent', async () => {
    mockGetRecords.mockResolvedValue({
      records: {
        coins: [{ coinType: 60, value: WALLET }],
        texts: [],
      },
    });
    const { lookupAgent } = await import('@/lib/ens');
    const result = await lookupAgent('agent-742d35.provix.eth');
    expect(result.worldIdVerified).toBe(false);
  });

  it('returns null address when no ETH coin record exists', async () => {
    mockGetRecords.mockResolvedValue({ records: { coins: [], texts: [] } });
    const { lookupAgent } = await import('@/lib/ens');
    const result = await lookupAgent('unknown.provix.eth');
    expect(result.address).toBeNull();
    expect(result.strategy).toBeNull();
  });

  it('accepts coinType as id field (alternate schema)', async () => {
    mockGetRecords.mockResolvedValue({
      records: {
        coins: [{ id: 60, value: WALLET }],
        texts: [{ key: 'strategy', value: 'rebalance' }],
      },
    });
    const { lookupAgent } = await import('@/lib/ens');
    const result = await lookupAgent('agent-742d35.provix.eth');
    expect(result.address).toBe(WALLET);
    expect(result.strategy).toBe('rebalance');
  });
});
