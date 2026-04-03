import { verifyCloudProof } from '@worldcoin/minikit-js';
import type { ISuccessResult } from '@worldcoin/minikit-js';

function requireAppId(): `app_${string}` {
  const id = process.env.APP_ID;
  if (!id) throw new Error('APP_ID env var not set');
  return id as `app_${string}`;
}

export async function verifyWorldIdProof(
  payload: ISuccessResult,
  action: string,
  signal?: string
): Promise<{ success: boolean }> {
  const result = await verifyCloudProof(payload, requireAppId(), action, signal);
  return { success: result.success };
}
