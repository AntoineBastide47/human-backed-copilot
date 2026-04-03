import { NextResponse } from 'next/server';
import type { Execution } from '@/types';

const STUB_EXECUTIONS: Execution[] = [
  {
    id: 'stub-exec-1',
    agentId: 'stub-agent-1',
    strategyId: 'stub-strat-1',
    proposalId: 'stub-prop-0',
    txHash: '0x' + 'b'.repeat(64),
    amountIn: '500000000000000000',
    amountOut: '912000000',
    status: 'confirmed',
    executedAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
  {
    id: 'stub-exec-2',
    agentId: 'stub-agent-1',
    strategyId: 'stub-strat-1',
    proposalId: 'stub-prop-neg1',
    txHash: '0x' + 'c'.repeat(64),
    amountIn: '500000000000000000',
    amountOut: '934000000',
    status: 'confirmed',
    executedAt: new Date(Date.now() - 172_800_000).toISOString(),
  },
];

// STUB: returns mock data. Replace with real DB logic in H7.5-12.
export async function GET(req: Request): Promise<NextResponse<Execution[]>> {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('agentId');

  const filtered = agentId
    ? STUB_EXECUTIONS.filter((e) => e.agentId === agentId)
    : STUB_EXECUTIONS;

  return NextResponse.json(filtered);
}
