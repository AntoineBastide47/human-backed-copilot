import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { worldchain } from 'viem/chains';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { E, isValidAddress } from '@/lib/api-response';
import { AGENT_BOOK_ADDRESS } from '@/lib/constants';

const AGENT_BOOK_ABI = [
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'getNextNonce',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * GET /api/agents/register?address=0x...
 * Returns the AgentBook nonce for the given wallet address.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    await getSessionUserId(req);
  } catch (err) {
    if (err instanceof AuthError) return E.unauthorized(err.message);
    return E.internal();
  }

  const url = new URL(req.url);
  const address = url.searchParams.get('address');
  if (!address || !isValidAddress(address)) {
    return E.badRequest('Invalid address');
  }

  try {
    const client = createPublicClient({ chain: worldchain, transport: http() });
    const nonce = await client.readContract({
      address: AGENT_BOOK_ADDRESS,
      abi: AGENT_BOOK_ABI,
      functionName: 'getNextNonce',
      args: [address as `0x${string}`],
    });

    return NextResponse.json({ nonce: nonce.toString() });
  } catch (err) {
    console.error('[agents/register] nonce lookup failed:', err);
    return E.internal();
  }
}
