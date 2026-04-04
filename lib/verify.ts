import type { WorldIdProof } from '@/types';

function requireAppId(): string {
  const id = process.env.APP_ID;
  if (!id) throw new Error('APP_ID env var not set');
  return id;
}

export async function verifyWorldIdProof(
  payload: WorldIdProof,
  action: string,
  signal?: string
): Promise<{ success: boolean }> {
  const appId = requireAppId();
  const res = await fetch(
    `https://developer.worldcoin.org/api/v2/verify/${appId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nullifier_hash: payload.nullifier_hash,
        merkle_root: payload.merkle_root,
        proof: payload.proof,
        verification_level: payload.verification_level,
        action,
        ...(signal ? { signal } : {}),
      }),
    }
  );

  if (!res.ok) return { success: false };

  const data = await res.json();
  return { success: data.success === true };
}
