import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    id: 'stub', ownerId: 'stub', walletAddress: '0x0', ensName: null,
    status: 'active', usageCount: 0, freeTrialRemaining: 3,
    spendLimits: { maxPerTx: '0', dailyCap: '0' }, createdAt: new Date().toISOString(),
  });
}
