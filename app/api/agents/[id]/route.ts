import { NextResponse } from 'next/server';
import type { Agent } from '@/types';

// STUB: returns mock data. Replace with real DB logic in H3.5-7.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<Agent | { error: string }>> {
  const { id } = await params;
  return NextResponse.json({
    id,
    ownerId: 'stub-user-1',
    walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
    ensName: 'demo-dca.copilot.eth',
    status: 'active',
    usageCount: 1,
    freeTrialRemaining: 2,
    spendLimits: { maxPerTx: '1000000', dailyCap: '5000000' },
    createdAt: new Date().toISOString(),
  });
}
