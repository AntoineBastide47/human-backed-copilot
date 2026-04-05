import { NextResponse } from 'next/server';
import { lookupAgent } from '@/lib/ens';
import { E } from '@/lib/api-response';

export interface EnsLookupResponse {
  ensName: string;
  address: string | null;
  strategy: string | null;
  worldIdVerified: boolean;
}

/**
 * GET /api/ens/:name
 * Public — no auth required.
 * Resolves a provix.eth agent subname to its address + metadata.
 * Example: GET /api/ens/agent-742d35.provix.eth
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse<EnsLookupResponse | { error: string }>> {
  const { name } = await params;
  if (!name || !name.includes('.')) return E.badRequest('Invalid ENS name');

  try {
    const result = await lookupAgent(name);
    return NextResponse.json({ ensName: name, ...result });
  } catch (err) {
    console.error('[ENS] lookupAgent failed:', err);
    return E.notFound('ENS name not found');
  }
}
