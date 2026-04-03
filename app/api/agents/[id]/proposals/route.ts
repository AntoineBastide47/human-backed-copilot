import { NextResponse } from 'next/server';
import type { Proposal } from '@/types';

const STUB_PROPOSALS: Proposal[] = [
  {
    id: 'stub-prop-1',
    agentId: 'stub-agent-1',
    strategyId: 'stub-strat-1',
    type: 'dca_buy',
    tokenIn: '0x4200000000000000000000000000000000000006',
    tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
    amount: '500000000000000000',
    estimatedOutput: '925000000',
    reasoning: 'Scheduled DCA interval reached. WETH price within acceptable range.',
    status: 'pending',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'stub-prop-2',
    agentId: 'stub-agent-1',
    strategyId: 'stub-strat-1',
    type: 'rebalance',
    tokenIn: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
    tokenOut: '0x4200000000000000000000000000000000000006',
    amount: '200000000',
    estimatedOutput: '108108108108108108',
    reasoning: 'Portfolio drifted 5% above USDC target. Rebalancing to restore allocation.',
    status: 'pending',
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
  },
];

// STUB: returns mock data. Replace with real DB logic in H3.5-7.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<Proposal[]>> {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const filtered = STUB_PROPOSALS.map((p) => ({ ...p, agentId: id })).filter(
    (p) => !status || p.status === status
  );
  return NextResponse.json(filtered);
}
