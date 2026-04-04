import { NextResponse } from 'next/server';
import { verifyWorldIdProof } from '@/lib/verify';
import { signSession, sessionCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { E, isValidAddress } from '@/lib/api-response';
import { WORLD_ID_ACTION } from '@/lib/constants';
import type { VerifyRequest, VerifyResponse } from '@/types';

export async function POST(req: Request): Promise<NextResponse<VerifyResponse | { error: string }>> {
  let body: VerifyRequest;
  try {
    body = await req.json();
  } catch {
    return E.badRequest('Invalid JSON');
  }

  const { payload, action, signal } = body;

  if (!payload || !action) return E.badRequest('Missing payload or action');

  // Security: action must match the registered Incognito Action exactly
  if (action !== WORLD_ID_ACTION) return E.badRequest('Invalid action');

  // signal carries the wallet address from the frontend — validate before storing
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
