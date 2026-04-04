import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { E } from '@/lib/api-response';
import { WORLD_ID_ACTION } from '@/lib/constants';
// Use the signing subpath to avoid pulling in React (server-side route)
import { signRequest } from '@worldcoin/idkit/signing';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`${name} env var not set`);
  return val;
}

export async function POST(req: Request) {
  try {
    await getSessionUserId(req);
  } catch (err) {
    if (err instanceof AuthError) return E.unauthorized(err.message);
    return E.internal();
  }

  try {
    const signingKey = requireEnv('DEV_PORTAL_SIGNING_KEY');
    const rpId = requireEnv('DEV_PORTAL_RP_ID');
    const appId = requireEnv('APP_ID');

    const signed = signRequest(WORLD_ID_ACTION, signingKey);

    return NextResponse.json({
      rp_context: {
        rp_id: rpId,
        nonce: signed.nonce,
        created_at: signed.createdAt,
        expires_at: signed.expiresAt,
        signature: signed.sig,
      },
      app_id: appId,
      action: WORLD_ID_ACTION,
    });
  } catch (err) {
    console.error('[agents/prepare] Failed to sign request:', err);
    return E.internal();
  }
}
