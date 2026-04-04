import { NextResponse } from 'next/server';
import { verifyWorldIdProof } from '@/lib/verify';
import { signSession, sessionCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { E, isValidAddress } from '@/lib/api-response';
import { WORLD_ID_ACTION } from '@/lib/constants';
import type { VerifyResponse } from '@/types';

interface WalletAuthBody {
  payload: {
    address: string;
    message: string;
    signature: string;
    nonce: string;
  };
  walletAuth: true;
}

interface WorldIdBody {
  payload: {
    nullifier_hash: string;
    merkle_root: string;
    proof: string;
    verification_level?: string;
  };
  action: string;
  signal?: string;
  walletAuth?: false;
}

type VerifyBody = WalletAuthBody | WorldIdBody;

function isWalletAuth(body: VerifyBody): body is WalletAuthBody {
  return body.walletAuth === true;
}

export async function POST(req: Request): Promise<NextResponse<VerifyResponse | { error: string }>> {
  let body: VerifyBody;
  try {
    body = await req.json();
  } catch {
    return E.badRequest('Invalid JSON');
  }

  if (!body.payload) return E.badRequest('Missing payload');

  // ── walletAuth flow (MiniKit v2) ──
  if (isWalletAuth(body)) {
    const { address, nonce } = body.payload;

    if (!address || !nonce) return E.badRequest('Missing address or nonce');
    if (!isValidAddress(address)) return E.badRequest('Invalid wallet address');

    try {
      // Use wallet address as a stable identifier (nullifier equivalent)
      const nullifierHash = `walletauth_${address.toLowerCase()}`;

      const user = await db.user.upsert({
        where: { nullifierHash },
        create: {
          nullifierHash,
          walletAddress: address,
          verificationLevel: 'orb',
          isVerified: true,
        },
        update: {
          isVerified: true,
          walletAddress: address,
        },
      });

      const token = await signSession({ userId: user.id });

      return NextResponse.json(
        { userId: user.id, verified: true, walletAddress: user.walletAddress },
        { headers: { 'Set-Cookie': sessionCookie(token) } }
      );
    } catch (err) {
      console.error('walletAuth verify failed:', err);
      return E.internal();
    }
  }

  // ── Legacy World ID proof flow ──
  const { payload, action, signal } = body;

  if (!action) return E.badRequest('Missing action');
  if (action !== WORLD_ID_ACTION) return E.badRequest('Invalid action');

  const walletAddress = signal ?? '';
  if (walletAddress && !isValidAddress(walletAddress)) {
    return E.badRequest('Invalid wallet address in signal');
  }

  const result = await verifyWorldIdProof(payload, action, signal);
  if (!result.success) return E.badRequest('World ID verification failed');

  const user = await db.user.upsert({
    where: { nullifierHash: payload.nullifier_hash },
    create: {
      nullifierHash: payload.nullifier_hash,
      walletAddress,
      verificationLevel: payload.verification_level ?? 'orb',
      isVerified: true,
    },
    update: {
      isVerified: true,
      ...(walletAddress ? { walletAddress } : {}),
    },
  });

  const token = await signSession({ userId: user.id });

  return NextResponse.json(
    { userId: user.id, verified: true, walletAddress: user.walletAddress },
    { headers: { 'Set-Cookie': sessionCookie(token) } }
  );
}
