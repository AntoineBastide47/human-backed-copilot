import { describe, it, expect, vi, beforeEach } from 'vitest';

type AgentkitTestModule = typeof import('@worldcoin/agentkit') & {
  __mockLookupHuman: ReturnType<typeof vi.fn>;
  __mockTryIncrementUsage: ReturnType<typeof vi.fn>;
  __mockHasUsedNonce: ReturnType<typeof vi.fn>;
  __mockRecordNonce: ReturnType<typeof vi.fn>;
};

async function importMockAgentkit(): Promise<AgentkitTestModule> {
  return (await import('@worldcoin/agentkit')) as AgentkitTestModule;
}

const mockWriteContract = vi.fn();
const mockWaitForTransactionReceipt = vi.fn();
const mockReadContract = vi.fn();

vi.mock('../wallet', () => ({
  getWalletClient: () => ({ writeContract: mockWriteContract }),
  getPublicClient: () => ({
    readContract: mockReadContract,
    waitForTransactionReceipt: mockWaitForTransactionReceipt,
  }),
}));

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    decodeAbiParameters: vi.fn(() => [
      [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n],
    ]),
  };
});

vi.mock('@worldcoin/agentkit', () => {
  const mockLookupHuman = vi.fn();
  const mockTryIncrementUsage = vi.fn().mockResolvedValue(true);
  const mockHasUsedNonce = vi.fn().mockResolvedValue(false);
  const mockRecordNonce = vi.fn().mockResolvedValue(undefined);
  const mockEnrichPaymentRequiredResponse = vi.fn(async () => ({
    info: {
      domain: 'example.com',
      uri: 'https://example.com/api/agent/execute-trade',
      version: '1',
      nonce: 'challenge-nonce',
      issuedAt: '2026-01-01T00:00:00.000Z',
    },
    supportedChains: [{ chainId: 'eip155:480', type: 'eip191' }],
    schema: {},
    mode: { type: 'free-trial', uses: 3 },
  }));

  return {
    createAgentBookVerifier: vi.fn(() => ({ lookupHuman: mockLookupHuman })),
    createAgentkitHooks: vi.fn(() => ({
      requestHook: vi.fn(),
      verifyFailureHook: vi.fn(),
    })),
    declareAgentkitExtension: vi.fn(() => ({ agentkit: 'extension-config' })),
    InMemoryAgentKitStorage: class {
      tryIncrementUsage = mockTryIncrementUsage;
      hasUsedNonce = mockHasUsedNonce;
      recordNonce = mockRecordNonce;
    },
    agentkitResourceServerExtension: {
      key: 'agentkit',
      enrichPaymentRequiredResponse: mockEnrichPaymentRequiredResponse,
    },
    parseAgentkitHeader: vi.fn(),
    validateAgentkitMessage: vi.fn(),
    verifyAgentkitSignature: vi.fn(),
    __mockLookupHuman: mockLookupHuman,
    __mockTryIncrementUsage: mockTryIncrementUsage,
    __mockHasUsedNonce: mockHasUsedNonce,
    __mockRecordNonce: mockRecordNonce,
  };
});

const VALID_PROOF = {
  merkle_root: '0x1234',
  nullifier_hash: '0x5678',
  proof: '0x' + '00'.repeat(256),
};

describe('agentkit', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.WORLD_CHAIN_RPC = 'https://rpc.example.com';
    process.env.WALLET_PRIVATE_KEY = '0x' + 'ab'.repeat(32);
  });

  describe('constants', () => {
    it('exports correct WORLD_CHAIN', async () => {
      const { WORLD_CHAIN } = await import('../agentkit');
      expect(WORLD_CHAIN).toBe('eip155:480');
    });

    it('exports correct WORLD_USDC', async () => {
      const { WORLD_USDC } = await import('../agentkit');
      expect(WORLD_USDC).toBe('0x79A02482A880bCE3F13e09Da970dC34db4CD24d1');
    });
  });

  describe('registerAgent', () => {
    it('submits register tx and returns txHash on success', async () => {
      mockReadContract.mockResolvedValueOnce(0n); // getNextNonce
      mockWriteContract.mockResolvedValueOnce('0xtxhash');
      mockWaitForTransactionReceipt.mockResolvedValueOnce({ status: 'success' });

      const { registerAgent } = await import('../agentkit');
      const result = await registerAgent('0x' + 'a'.repeat(40), VALID_PROOF);
      expect(result.registered).toBe(true);
      expect(result.txHash).toBe('0xtxhash');
    });

    it('throws when tx reverts', async () => {
      mockReadContract.mockResolvedValueOnce(0n);
      mockWriteContract.mockResolvedValueOnce('0xfailed');
      mockWaitForTransactionReceipt.mockResolvedValueOnce({ status: 'reverted' });

      const { registerAgent } = await import('../agentkit');
      await expect(
        registerAgent('0x' + 'b'.repeat(40), VALID_PROOF),
      ).rejects.toThrow('reverted');
    });

    it('throws on invalid wallet address', async () => {
      const { registerAgent } = await import('../agentkit');
      await expect(
        registerAgent('bad-address', VALID_PROOF),
      ).rejects.toThrow('Invalid wallet address');
    });

    it('throws on short address', async () => {
      const { registerAgent } = await import('../agentkit');
      await expect(
        registerAgent('0x1234', VALID_PROOF),
      ).rejects.toThrow('Invalid wallet address');
    });
  });

  describe('verifyAgentIsHuman', () => {
    it('returns true for registered agent', async () => {
      const agentkit = await importMockAgentkit();
      const mockLookup = agentkit.__mockLookupHuman;
      mockLookup.mockResolvedValueOnce('0xhumanid');

      const { verifyAgentIsHuman } = await import('../agentkit');
      expect(await verifyAgentIsHuman('0x' + 'a'.repeat(40))).toBe(true);
    });

    it('returns false for unregistered agent', async () => {
      const agentkit = await importMockAgentkit();
      const mockLookup = agentkit.__mockLookupHuman;
      mockLookup.mockResolvedValueOnce(null);

      const { verifyAgentIsHuman } = await import('../agentkit');
      expect(await verifyAgentIsHuman('0x' + 'c'.repeat(40))).toBe(false);
    });

    it('returns false on network error instead of throwing', async () => {
      const agentkit = await importMockAgentkit();
      const mockLookup = agentkit.__mockLookupHuman;
      mockLookup.mockRejectedValueOnce(new Error('RPC timeout'));

      const { verifyAgentIsHuman } = await import('../agentkit');
      expect(await verifyAgentIsHuman('0x' + 'd'.repeat(40))).toBe(false);
    });
  });

  describe('verifyAgentkitRequest', () => {
    it('returns 402 when no agentkit header present', async () => {
      const { verifyAgentkitRequest } = await import('../agentkit');
      const req = new Request('https://example.com/api/agent/execute-trade', {
        method: 'POST',
      });
      const result = await verifyAgentkitRequest(req);
      expect(result.granted).toBe(false);
      if (!result.granted) {
        expect(result.status).toBe(402);
        expect(result.body.error).toBe('Payment Required');
        expect(result.body.extensions).toEqual({
          agentkit: expect.objectContaining({
            info: expect.objectContaining({
              nonce: 'challenge-nonce',
              uri: 'https://example.com/api/agent/execute-trade',
            }),
          }),
        });
      }
    });

    it('returns 403 on invalid agentkit header', async () => {
      const agentkit = await import('@worldcoin/agentkit');
      const parseHeader = agentkit.parseAgentkitHeader as ReturnType<typeof vi.fn>;
      parseHeader.mockImplementation(() => {
        throw new Error('Malformed header');
      });

      const { verifyAgentkitRequest } = await import('../agentkit');
      const req = new Request('https://example.com/api/agent/execute-trade', {
        method: 'POST',
        headers: { agentkit: 'invalid-base64' },
      });
      const result = await verifyAgentkitRequest(req);
      expect(result.granted).toBe(false);
      if (!result.granted) {
        expect(result.status).toBe(403);
        expect(result.body.error).toBe('Agentkit verification failed');
      }
    });

    it('returns 403 when validation fails', async () => {
      const agentkit = await import('@worldcoin/agentkit');
      const parseHeader = agentkit.parseAgentkitHeader as ReturnType<typeof vi.fn>;
      const validateMessage = agentkit.validateAgentkitMessage as ReturnType<typeof vi.fn>;
      const mockHasUsedNonce = (agentkit as AgentkitTestModule).__mockHasUsedNonce;

      parseHeader.mockReturnValueOnce({
        address: '0x' + 'a'.repeat(40),
        nonce: 'nonce-1',
        chainId: 'eip155:480',
      });
      validateMessage.mockResolvedValueOnce({ valid: false, error: 'Domain mismatch' });

      const { verifyAgentkitRequest } = await import('../agentkit');
      const req = new Request('https://example.com/api/agent/execute-trade', {
        method: 'POST',
        headers: { agentkit: 'some-header' },
      });
      const result = await verifyAgentkitRequest(req);
      expect(result.granted).toBe(false);
      if (!result.granted) {
        expect(result.status).toBe(403);
        expect(result.body.reason).toBe('Domain mismatch');
      }
      const [, , options] = validateMessage.mock.calls[0] as [
        unknown,
        unknown,
        { checkNonce?: (nonce: string) => Promise<boolean> }
      ];
      mockHasUsedNonce.mockResolvedValueOnce(true);
      expect(options.checkNonce).toBeTypeOf('function');
      await expect(options.checkNonce?.('nonce-1')).resolves.toBe(false);
    });

    it('returns 403 when signature verification fails', async () => {
      const agentkit = await import('@worldcoin/agentkit');
      const parseHeader = agentkit.parseAgentkitHeader as ReturnType<typeof vi.fn>;
      const validateMessage = agentkit.validateAgentkitMessage as ReturnType<typeof vi.fn>;
      const verifySig = agentkit.verifyAgentkitSignature as ReturnType<typeof vi.fn>;

      parseHeader.mockReturnValueOnce({
        address: '0x' + 'a'.repeat(40),
        nonce: 'nonce-2',
        chainId: 'eip155:480',
      });
      validateMessage.mockResolvedValueOnce({ valid: true });
      verifySig.mockResolvedValueOnce({ valid: false, error: 'Bad signature' });

      const { verifyAgentkitRequest } = await import('../agentkit');
      const req = new Request('https://example.com/api/agent/execute-trade', {
        method: 'POST',
        headers: { agentkit: 'some-header' },
      });
      const result = await verifyAgentkitRequest(req);
      expect(result.granted).toBe(false);
      if (!result.granted) {
        expect(result.status).toBe(403);
        expect(result.body.error).toBe('Invalid agentkit signature');
      }
    });

    it('returns 403 when agent not in AgentBook', async () => {
      const agentkit = await importMockAgentkit();
      const parseHeader = agentkit.parseAgentkitHeader as ReturnType<typeof vi.fn>;
      const validateMessage = agentkit.validateAgentkitMessage as ReturnType<typeof vi.fn>;
      const verifySig = agentkit.verifyAgentkitSignature as ReturnType<typeof vi.fn>;
      const mockLookup = agentkit.__mockLookupHuman;

      parseHeader.mockReturnValueOnce({
        address: '0x' + 'a'.repeat(40),
        nonce: 'nonce-3',
        chainId: 'eip155:480',
      });
      validateMessage.mockResolvedValueOnce({ valid: true });
      verifySig.mockResolvedValueOnce({ valid: true, address: '0x' + 'a'.repeat(40) });
      mockLookup.mockResolvedValueOnce(null);

      const { verifyAgentkitRequest } = await import('../agentkit');
      const req = new Request('https://example.com/api/agent/execute-trade', {
        method: 'POST',
        headers: { agentkit: 'some-header' },
      });
      const result = await verifyAgentkitRequest(req);
      expect(result.granted).toBe(false);
      if (!result.granted) {
        expect(result.status).toBe(403);
        expect(result.body.error).toBe('Agent not registered in AgentBook');
      }
    });

    it('returns granted: true for verified human-backed agent', async () => {
      const agentkit = await importMockAgentkit();
      const parseHeader = agentkit.parseAgentkitHeader as ReturnType<typeof vi.fn>;
      const validateMessage = agentkit.validateAgentkitMessage as ReturnType<typeof vi.fn>;
      const verifySig = agentkit.verifyAgentkitSignature as ReturnType<typeof vi.fn>;
      const mockLookup = agentkit.__mockLookupHuman;
      const mockRecordNonce = agentkit.__mockRecordNonce;

      parseHeader.mockReturnValueOnce({
        address: '0x' + 'a'.repeat(40),
        nonce: 'nonce-4',
        chainId: 'eip155:480',
      });
      validateMessage.mockResolvedValueOnce({ valid: true });
      verifySig.mockResolvedValueOnce({ valid: true, address: '0x' + 'a'.repeat(40) });
      mockLookup.mockResolvedValueOnce('0xhumanid123');

      const { verifyAgentkitRequest } = await import('../agentkit');
      const req = new Request('https://example.com/api/agent/execute-trade', {
        method: 'POST',
        headers: { agentkit: 'valid-header' },
      });
      const result = await verifyAgentkitRequest(req);
      expect(result.granted).toBe(true);
      expect(mockRecordNonce).toHaveBeenCalledWith('nonce-4');
    });

    it('returns 402 when free trial exhausted', async () => {
      const agentkit = await importMockAgentkit();
      const parseHeader = agentkit.parseAgentkitHeader as ReturnType<typeof vi.fn>;
      const validateMessage = agentkit.validateAgentkitMessage as ReturnType<typeof vi.fn>;
      const verifySig = agentkit.verifyAgentkitSignature as ReturnType<typeof vi.fn>;
      const mockLookup = agentkit.__mockLookupHuman;
      const mockTryIncrement = agentkit.__mockTryIncrementUsage;

      parseHeader.mockReturnValueOnce({
        address: '0x' + 'a'.repeat(40),
        nonce: 'nonce-5',
        chainId: 'eip155:480',
      });
      validateMessage.mockResolvedValueOnce({ valid: true });
      verifySig.mockResolvedValueOnce({ valid: true, address: '0x' + 'a'.repeat(40) });
      mockLookup.mockResolvedValueOnce('0xhumanid123');
      mockTryIncrement.mockResolvedValueOnce(false);

      const { verifyAgentkitRequest } = await import('../agentkit');
      const req = new Request('https://example.com/api/agent/execute-trade', {
        method: 'POST',
        headers: { agentkit: 'valid-header' },
      });
      const result = await verifyAgentkitRequest(req);
      expect(result.granted).toBe(false);
      if (!result.granted) {
        expect(result.status).toBe(402);
        expect(result.body.error).toBe('Free trial exhausted');
      }
    });
  });
});
