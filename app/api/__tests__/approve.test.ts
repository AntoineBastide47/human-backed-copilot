import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      }),
  },
}));

vi.mock('@/lib/auth', () => ({
  getSessionUserId: vi.fn(),
  AuthError: class AuthError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    proposal: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/services/uniswap', () => ({
  prepareUserSwap: vi.fn(),
  getCurrentPermit2Allowance: vi.fn(),
}));

import { POST } from '@/app/api/agents/[id]/approve/route';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { prepareUserSwap, getCurrentPermit2Allowance } from '@/services/uniswap';

const mockGetSession = vi.mocked(getSessionUserId);
const mockFindUnique = vi.mocked(db.proposal.findUnique);
const mockUpdateMany = vi.mocked(db.proposal.updateMany);
const mockUpdate = vi.mocked(db.proposal.update);
const mockPrepareUserSwap = vi.mocked(prepareUserSwap);
const mockGetCurrentPermit2Allowance = vi.mocked(getCurrentPermit2Allowance);

const now = new Date();
const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';

const activeAgent = {
  id: 'a1',
  ownerId: 'u1',
  walletAddress: '0x' + 'a'.repeat(40),
  status: 'active',
  spendLimits: { maxPerTx: '2000000000', dailyCap: '10000000000' },
  createdAt: now,
};
const pendingProposal = {
  id: 'p1',
  agentId: 'a1',
  strategyId: 's1',
  type: 'dca_buy',
  tokenIn: WETH,
  tokenOut: USDC,
  amount: '1000000000000000000',
  estimatedOutput: '900000000',
  reasoning: 'DCA',
  status: 'pending',
  createdAt: now,
  agent: activeAgent,
};

function req(body: unknown): Request {
  return new Request('http://localhost/api/agents/a1/approve', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function json<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue('u1' as never);
  mockFindUnique.mockResolvedValue(pendingProposal as never);
  mockUpdateMany.mockResolvedValue({ count: 1 } as never);
  mockGetCurrentPermit2Allowance.mockResolvedValue(BigInt('2500000000000000000') as never);
  mockPrepareUserSwap.mockResolvedValue({
    transactions: [
      {
        to: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
        data: '0xpermit2',
      },
      {
        to: '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9',
        data: '0x1234',
      },
    ],
    amountIn: pendingProposal.amount,
    amountOut: pendingProposal.estimatedOutput,
    approvalNeeded: true,
  } as never);
});

describe('POST /api/agents/[id]/approve', () => {
  it('returns prepared transactions for the World Wallet flow', async () => {
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(200);
    const data = await json<{
      success: true;
      transactions: Array<{ to: string; data: string }>;
      amountIn: string;
      amountOut: string;
      approvalNeeded: boolean;
      debug: {
        walletAddress: string;
        transactionTargets: string[];
        tokenIn: string;
        spender: string | null;
        currentAllowance: string | null;
      };
    }>(res);
    expect(data.success).toBe(true);
    expect(data.transactions).toHaveLength(2);
    expect(data.amountIn).toBe(pendingProposal.amount);
    expect(data.amountOut).toBe(pendingProposal.estimatedOutput);
    expect(data.debug.walletAddress).toBe(activeAgent.walletAddress);
    expect(data.debug.tokenIn).toBe(WETH);
    expect(data.debug.spender).toBe('0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9');
    expect(data.debug.currentAllowance).toBe('2500000000000000000');
    expect(data.debug.transactionTargets).toEqual([
      '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9',
    ]);
  });

  it('calls prepareUserSwap with the agent wallet address', async () => {
    await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(mockPrepareUserSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenIn: WETH,
        tokenOut: USDC,
        chainId: 480,
        amount: pendingProposal.amount,
      }),
      activeAgent.walletAddress,
    );
  });

  it('returns 401 when no session exists', async () => {
    mockGetSession.mockRejectedValue(new AuthError('Unauthorized', 401));
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 400 when proposalId is missing', async () => {
    const res = await POST(req({}), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when proposal is not found', async () => {
    mockFindUnique.mockResolvedValue(null as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(404);
  });

  it('returns 409 when proposal is already processed', async () => {
    mockFindUnique.mockResolvedValue({ ...pendingProposal, status: 'executed' } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(409);
  });

  it('returns 409 on optimistic lock races', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(409);
    expect(mockPrepareUserSwap).not.toHaveBeenCalled();
  });

  it('rolls the proposal back to pending when preparation fails', async () => {
    mockPrepareUserSwap.mockRejectedValue(new Error('No route available'));
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(400);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'pending' },
    });
    const data = await json<{ error: string }>(res);
    expect(data.error).toContain('No route available');
  });

  it('enforces the maxPerTx spend limit', async () => {
    mockFindUnique.mockResolvedValue({
      ...pendingProposal,
      estimatedOutput: '1250000000',
      agent: { ...activeAgent, spendLimits: { maxPerTx: '1000000000' } },
    } as never);

    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(400);
    const data = await json<{ error: string }>(res);
    expect(data.error).toContain('maxPerTx');
    expect(data.error).toContain('$1250');
    expect(data.error).toContain('$1000');
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('allows requests when maxPerTx is unset', async () => {
    mockFindUnique.mockResolvedValue({
      ...pendingProposal,
      agent: { ...activeAgent, spendLimits: {} },
    } as never);
    const res = await POST(req({ proposalId: 'p1' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(200);
  });
});
