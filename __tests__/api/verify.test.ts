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

vi.mock('@/lib/verify', () => ({
  verifyWorldIdProof: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  signSession: vi.fn(),
  sessionCookie: vi.fn(() => 'session=tok; HttpOnly; Path=/; SameSite=Lax'),
  AuthError: class AuthError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
}));

const mockUser = {
  id: 'user-1', nullifierHash: '0xnull', walletAddress: '0x' + 'a'.repeat(40),
  verificationLevel: 'orb', isVerified: true, createdAt: new Date(),
};
vi.mock('@/lib/db', () => ({
  db: { user: { upsert: vi.fn() } },
}));

vi.mock('@/lib/constants', () => ({
  WORLD_ID_ACTION: 'register-agent',
  WORLD_CHAIN_ID: 480,
}));

import { POST } from '@/app/api/verify/route';
import { verifyWorldIdProof } from '@/lib/verify';
import { signSession } from '@/lib/auth';
import { db } from '@/lib/db';

const mockVerify = vi.mocked(verifyWorldIdProof);
const mockSign = vi.mocked(signSession);
const mockUpsert = vi.mocked(db.user.upsert);

function req(body: unknown): Request {
  return new Request('http://localhost/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function json<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

const validPayload = {
  merkle_root: '0xmerkle',
  nullifier_hash: '0xnull',
  proof: '0xproof',
  credential_type: 'orb',
  verification_level: 'orb',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockVerify.mockResolvedValue({ success: true });
  mockSign.mockResolvedValue('signed-token');
  mockUpsert.mockResolvedValue(mockUser as never);
});

describe('POST /api/verify', () => {
  it('returns 200 with userId and sets cookie on success', async () => {
    const res = await POST(req({
      payload: validPayload,
      action: 'register-agent',
      signal: '0x' + 'a'.repeat(40),
    }));
    expect(res.status).toBe(200);
    const data = await json<{ userId: string; verified: boolean; walletAddress: string }>(res);
    expect(data.verified).toBe(true);
    expect(data.userId).toBe('user-1');
    expect(res.headers.get('set-cookie')).toContain('session=');
  });

  it('returns 400 for missing payload', async () => {
    const res = await POST(req({ action: 'register-agent' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for wrong action', async () => {
    const res = await POST(req({ payload: validPayload, action: 'wrong-action' }));
    expect(res.status).toBe(400);
    const data = await json<{ error: string }>(res);
    expect(data.error).toContain('action');
  });

  it('returns 400 when World ID verification fails', async () => {
    mockVerify.mockResolvedValue({ success: false });
    const res = await POST(req({ payload: validPayload, action: 'register-agent' }));
    expect(res.status).toBe(400);
    const data = await json<{ error: string }>(res);
    expect(data.error).toContain('World ID');
  });

  it('returns 400 for invalid JSON body', async () => {
    const badReq = new Request('http://localhost/api/verify', {
      method: 'POST',
      body: 'not-json',
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it('upserts user with walletAddress from signal', async () => {
    const signal = '0x' + 'c'.repeat(40);
    await POST(req({ payload: validPayload, action: 'register-agent', signal }));
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ walletAddress: signal }),
      })
    );
  });

  it('does not call verifyWorldIdProof for wrong action', async () => {
    await POST(req({ payload: validPayload, action: 'evil-action' }));
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('returns 400 when signal is a non-EVM-address string', async () => {
    const res = await POST(req({
      payload: validPayload,
      action: 'register-agent',
      signal: 'not-an-address',
    }));
    expect(res.status).toBe(400);
    const data = await json<{ error: string }>(res);
    expect(data.error).toContain('wallet address');
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('succeeds when signal is omitted (walletAddress stored as empty string)', async () => {
    const res = await POST(req({ payload: validPayload, action: 'register-agent' }));
    expect(res.status).toBe(200);
    expect(mockVerify).toHaveBeenCalled();
  });
});

// ── walletAuth flow (MiniKit v2) ───────────────────────────────────────────────

describe('POST /api/verify — walletAuth flow', () => {
  const WALLET = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18';

  function walletAuthReq(overrides?: Record<string, unknown>): Request {
    return req({
      walletAuth: true,
      payload: {
        address: WALLET,
        message: 'Sign in to Human-Backed Copilot',
        signature: '0xsig',
        nonce: 'abc123',
        ...overrides,
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockSign.mockResolvedValue('signed-token');
    mockUpsert.mockResolvedValue(mockUser as never);
  });

  it('returns 200 with userId, verified=true, and session cookie', async () => {
    const res = await POST(walletAuthReq());
    expect(res.status).toBe(200);
    const data = await json<{ userId: string; verified: boolean; walletAddress: string }>(res);
    expect(data.verified).toBe(true);
    expect(data.userId).toBe('user-1');
    expect(res.headers.get('set-cookie')).toContain('session=');
  });

  it('upserts user with walletauth_ nullifier derived from wallet address', async () => {
    await POST(walletAuthReq());
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { nullifierHash: `walletauth_${WALLET.toLowerCase()}` },
        create: expect.objectContaining({
          nullifierHash: `walletauth_${WALLET.toLowerCase()}`,
          walletAddress: WALLET,
          isVerified: true,
          verificationLevel: 'orb',
        }),
        update: expect.objectContaining({ isVerified: true, walletAddress: WALLET }),
      }),
    );
  });

  it('does NOT call verifyWorldIdProof (SIWE bypasses World ID)', async () => {
    await POST(walletAuthReq());
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('returns 400 when address is missing', async () => {
    const res = await POST(walletAuthReq({ address: undefined }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when address is not a valid EVM address', async () => {
    const res = await POST(walletAuthReq({ address: 'not-an-address' }));
    expect(res.status).toBe(400);
    const data = await json<{ error: string }>(res);
    expect(data.error).toContain('wallet address');
  });

  it('returns 400 when nonce is missing', async () => {
    const res = await POST(walletAuthReq({ nonce: undefined }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when db.user.upsert throws', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('DB connection lost'));
    const res = await POST(walletAuthReq());
    expect(res.status).toBe(500);
  });
});
