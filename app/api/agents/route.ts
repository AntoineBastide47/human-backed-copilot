import { NextResponse } from 'next/server';
import type { Agent } from '@/types';

// STUB: returns mock data. Replace with real DB logic in H3.5-7.
const STUB_AGENT: Agent = {
  id: 'stub-agent-1',
  ownerId: 'stub-user-1',
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
  ensName: 'demo-dca.copilot.eth',
  status: 'active',
  usageCount: 0,
  freeTrialRemaining: 3,
  spendLimits: { maxPerTx: '1000000', dailyCap: '5000000' },
  createdAt: new Date().toISOString(),
};

export async function GET(): Promise<NextResponse<Agent[]>> {
  return NextResponse.json([STUB_AGENT]);
}

export async function POST(): Promise<NextResponse<Agent>> {
  return NextResponse.json({ ...STUB_AGENT, status: 'registering' }, { status: 201 });
}
