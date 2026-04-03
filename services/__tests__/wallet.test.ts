import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock viem before importing wallet module
vi.mock('viem', () => {
  const mockWalletClient = {
    account: { address: '0x1234567890abcdef1234567890abcdef12345678' },
    sendTransaction: vi.fn(),
    signTypedData: vi.fn(),
  };
  const mockPublicClient = {
    waitForTransactionReceipt: vi.fn(),
  };
  return {
    createWalletClient: vi.fn(() => mockWalletClient),
    createPublicClient: vi.fn(() => mockPublicClient),
    http: vi.fn(() => 'http-transport'),
  };
});

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn((key: string) => ({
    address: '0x1234567890abcdef1234567890abcdef12345678',
    type: 'local',
  })),
}));

describe('wallet', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.WORLD_CHAIN_RPC = 'https://rpc.example.com';
    process.env.WALLET_PRIVATE_KEY = '0x' + 'ab'.repeat(32);
  });

  it('throws if WORLD_CHAIN_RPC is missing', async () => {
    delete process.env.WORLD_CHAIN_RPC;
    const { getWalletClient } = await import('../wallet');
    expect(() => getWalletClient()).toThrow('WORLD_CHAIN_RPC is not set');
  });

  it('throws if WALLET_PRIVATE_KEY is missing', async () => {
    delete process.env.WALLET_PRIVATE_KEY;
    const { getWalletClient } = await import('../wallet');
    expect(() => getWalletClient()).toThrow('WALLET_PRIVATE_KEY is not set');
  });

  it('throws if WALLET_PRIVATE_KEY has wrong format', async () => {
    process.env.WALLET_PRIVATE_KEY = 'not-a-valid-key';
    const { getWalletClient } = await import('../wallet');
    expect(() => getWalletClient()).toThrow('0x-prefixed 32-byte hex string');
  });

  it('creates wallet client with valid env', async () => {
    const { getWalletClient, getWalletAddress } = await import('../wallet');
    const client = getWalletClient();
    expect(client).toBeDefined();
    expect(client.account.address).toMatch(/^0x[0-9a-f]{40}$/i);
    expect(getWalletAddress()).toBe(client.account.address);
  });

  it('returns same instance on repeated calls (singleton)', async () => {
    const { getWalletClient, getPublicClient } = await import('../wallet');
    const w1 = getWalletClient();
    const w2 = getWalletClient();
    expect(w1).toBe(w2);

    const p1 = getPublicClient();
    const p2 = getPublicClient();
    expect(p1).toBe(p2);
  });

  it('exports WORLD_CHAIN_ID as 480', async () => {
    const { WORLD_CHAIN_ID } = await import('../wallet');
    expect(WORLD_CHAIN_ID).toBe(480);
  });

  it('worldChain has correct config', async () => {
    const { worldChain } = await import('../wallet');
    expect(worldChain.id).toBe(480);
    expect(worldChain.name).toBe('World Chain');
    expect(worldChain.nativeCurrency.decimals).toBe(18);
  });
});
