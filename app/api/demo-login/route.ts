import { NextResponse } from 'next/server';
import { signSession, sessionCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { E } from '@/lib/api-response';

const DEMO_NULLIFIER = 'demo_nullifier_0x0000000000000000000000000000000000000001';
const DEMO_WALLET = '0x0000000000000000000000000000000000000001';

export async function POST(): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') {
    return E.forbidden('Demo mode is not enabled');
  }

  try {
    const user = await db.user.upsert({
      where: { nullifierHash: DEMO_NULLIFIER },
      create: {
        nullifierHash: DEMO_NULLIFIER,
        walletAddress: DEMO_WALLET,
        verificationLevel: 'orb',
        isVerified: true,
      },
      update: { isVerified: true },
    });

    const token = await signSession({ userId: user.id });

    return NextResponse.json(
      { userId: user.id, verified: true, walletAddress: user.walletAddress },
      { headers: { 'Set-Cookie': sessionCookie(token) } }
    );
  } catch (err) {
    console.error('Demo login failed:', err);
    return E.internal();
  }
}
