import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@worldcoin/agentkit', () => {
  const mockLookupHuman = vi.fn();
  const mockTryIncrementUsage = vi.fn().mockResolvedValue(true);
  const mockHasUsedNonce = vi.fn().mockResolvedValue(false);
  const mockRecordNonce = vi.fn().mockResolvedValue(undefined);

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
    agentkitResourceServerExtension: { key: 'agentkit' },
    parseAgentkitHeader: vi.fn(),
    validateAgentkitMessage: vi.fn(),
    verifyAgentkitSignature: vi.fn(),
    __mockLookupHuman: mockLookupHuman,
    __mockTryIncrementUsage: mockTryIncrementUsage,
  };
});

describe('agentkit', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.WORLD_CHAIN_RPC = 'https://rpc.example.com';
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
    it('returns registered: true when agent is in AgentBook', async () => {
      const agentkit = await import('@worldcoin/agentkit');
      const mockLookup = (agentkit as any).__mockLookupHuman;
      mockLookup.mockResolvedValueOnce('0xhumanid');

      const { registerAgent } = await import('../agentkit');
      const result = await registerAgent('0x' + 'a'.repeat(40));
      expect(result.registered).toBe(true);
    });

    it('returns registered: false when agent is not in AgentBook', async () => {
      const agentkit = await import('@worldcoin/agentkit');
      const mockLookup = (agentkit as any).__mockLookupHuman;
      mockLookup.mockResolvedValueOnce(null);

      const { registerAgent } = await import('../agentkit');
      const result = await registerAgent('0x' + 'b'.repeat(40));
      expect(result.registered).toBe(false);
    });

    it('throws on invalid wallet address', async () => {
      const { registerAgent } = await import('../agentkit');
      await expect(registerAgent('bad-address')).rejects.toThrow('Invalid wallet address');
    });

    it('throws on short address', async () => {
      const { registerAgent } = await import('../agentkit');
      await expect(registerAgent('0x1234')).rejects.toThrow('Invalid wallet address');
    });
  });

  describe('verifyAgentIsHuman', () => {
    it('returns true for registered agent', async () => {
      const agentkit = await import('@worldcoin/agentkit');
      const mockLookup = (agentkit as any).__mockLookupHuman;
      mockLookup.mockResolvedValueOnce('0xhumanid');

      const { verifyAgentIsHuman } = await import('../agentkit');
      expect(await verifyAgentIsHuman('0x' + 'a'.repeat(40))).toBe(true);
    });

    it('returns false for unregistered agent', async () => {
      const agentkit = await import('@worldcoin/agentkit');
      const mockLookup = (agentkit as any).__mockLookupHuman;
      mockLookup.mockResolvedValueOnce(null);

      const { verifyAgentIsHuman } = await import('../agentkit');
      expect(await verifyAgentIsHuman('0x' + 'c'.repeat(40))).toBe(false);
    });

    it('returns false on network error instead of throwing', async () => {
      const agentkit = await import('@worldcoin/agentkit');
      const mockLookup = (agentkit as any).__mockLookupHuman;
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

      parseHeader.mockReturnValueOnce({ address: '0x' + 'a'.repeat(40) });
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
    });

    it('returns 403 when signature verification fails', async () => {
      const agentkit = await import('@worldcoin/agentkit');
      const parseHeader = agentkit.parseAgentkitHeader as ReturnType<typeof vi.fn>;
      const validateMessage = agentkit.validateAgentkitMessage as ReturnType<typeof vi.fn>;
      const verifySig = agentkit.verifyAgentkitSignature as ReturnType<typeof vi.fn>;

      parseHeader.mockReturnValueOnce({ address: '0x' + 'a'.repeat(40) });
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
      const agentkit = await import('@worldcoin/agentkit');
      const parseHeader = agentkit.parseAgentkitHeader as ReturnType<typeof vi.fn>;
      const validateMessage = agentkit.validateAgentkitMessage as ReturnType<typeof vi.fn>;
      const verifySig = agentkit.verifyAgentkitSignature as ReturnType<typeof vi.fn>;
      const mockLookup = (agentkit as any).__mockLookupHuman;

      parseHeader.mockReturnValueOnce({ address: '0x' + 'a'.repeat(40) });
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
      const agentkit = await import('@worldcoin/agentkit');
      const parseHeader = agentkit.parseAgentkitHeader as ReturnType<typeof vi.fn>;
      const validateMessage = agentkit.validateAgentkitMessage as ReturnType<typeof vi.fn>;
      const verifySig = agentkit.verifyAgentkitSignature as ReturnType<typeof vi.fn>;
      const mockLookup = (agentkit as any).__mockLookupHuman;

      parseHeader.mockReturnValueOnce({ address: '0x' + 'a'.repeat(40) });
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
    });

    it('returns 402 when free trial exhausted', async () => {
      const agentkit = await import('@worldcoin/agentkit');
      const parseHeader = agentkit.parseAgentkitHeader as ReturnType<typeof vi.fn>;
      const validateMessage = agentkit.validateAgentkitMessage as ReturnType<typeof vi.fn>;
      const verifySig = agentkit.verifyAgentkitSignature as ReturnType<typeof vi.fn>;
      const mockLookup = (agentkit as any).__mockLookupHuman;
      const mockTryIncrement = (agentkit as any).__mockTryIncrementUsage;

      parseHeader.mockReturnValueOnce({ address: '0x' + 'a'.repeat(40) });
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
