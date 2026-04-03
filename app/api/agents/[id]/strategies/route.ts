import { NextResponse } from 'next/server';
import type { AgentStrategy } from '@/types';

// STUB: returns mock data. Replace with real DB logic in H3.5-7.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<AgentStrategy>> {
  const { id } = await params;
  return NextResponse.json(
    {
      id: 'stub-strat-1',
      agentId: id,
      name: 'Daily WETH→USDC DCA',
      tokenIn: '0x4200000000000000000000000000000000000006',
      tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
      chainId: 480,
      amountPerInterval: '500000000000000000',
      interval: 'daily',
      autoExecute: false,
      status: 'active',
      createdAt: new Date().toISOString(),
    },
    { status: 201 }
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<AgentStrategy[]>> {
  const { id } = await params;
  return NextResponse.json([
    {
      id: 'stub-strat-1',
      agentId: id,
      name: 'Daily WETH→USDC DCA',
      tokenIn: '0x4200000000000000000000000000000000000006',
      tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
      chainId: 480,
      amountPerInterval: '500000000000000000',
      interval: 'daily',
      autoExecute: false,
      status: 'active',
      createdAt: new Date().toISOString(),
    },
  ]);
}
