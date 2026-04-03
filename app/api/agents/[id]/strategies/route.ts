import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E, isValidAddress } from '@/lib/api-response';
import { toStrategyResponse } from '@/lib/agent-service';
import { startAgentLoop } from '@/services/agent-runtime';
import { WORLD_CHAIN_ID } from '@/lib/constants';
import type { CreateStrategyInput, AgentStrategy } from '@/types';

const VALID_INTERVALS = new Set(['hourly', 'daily', 'weekly']);

async function assertOwnership(agentId: string, userId: string) {
  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.ownerId !== userId) return null;
  return agent;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<AgentStrategy[] | { error: string }>> {
  let userId: string;
  try {
    userId = await getSessionUserId(req);
  } catch (err) {
    if (err instanceof AuthError) return E.unauthorized(err.message);
    return E.internal();
  }

  const { id } = await params;
  if (!(await assertOwnership(id, userId))) return E.notFound('Agent not found');

  const rows = await db.agentStrategy.findMany({
    where: { agentId: id },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(rows.map(toStrategyResponse));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<AgentStrategy | { error: string }>> {
  let userId: string;
  try {
    userId = await getSessionUserId(req);
  } catch (err) {
    if (err instanceof AuthError) return E.unauthorized(err.message);
    return E.internal();
  }

  const { id } = await params;
  if (!(await assertOwnership(id, userId))) return E.notFound('Agent not found');

  let body: CreateStrategyInput;
  try {
    body = await req.json();
  } catch {
    return E.badRequest('Invalid JSON');
  }

  const { name, tokenIn, tokenOut, amountPerInterval, interval, autoExecute, chainId } = body;

  if (!name?.trim()) return E.badRequest('name is required');
  if (!isValidAddress(tokenIn)) return E.badRequest('Invalid tokenIn address');
  if (!isValidAddress(tokenOut)) return E.badRequest('Invalid tokenOut address');
  if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) return E.badRequest('tokenIn and tokenOut must differ');
  if (!VALID_INTERVALS.has(interval)) return E.badRequest('interval must be hourly, daily, or weekly');
  if (!amountPerInterval) return E.badRequest('amountPerInterval is required');

  try {
    if (BigInt(amountPerInterval) <= 0n) return E.badRequest('amountPerInterval must be positive');
  } catch {
    return E.badRequest('amountPerInterval must be a valid integer string');
  }

  const resolvedChainId = chainId ?? WORLD_CHAIN_ID;
  if (resolvedChainId !== WORLD_CHAIN_ID) return E.badRequest(`Only World Chain (${WORLD_CHAIN_ID}) is supported`);

  const strategy = await db.agentStrategy.create({
    data: {
      agentId: id,
      name: name.trim(),
      tokenIn,
      tokenOut,
      chainId: resolvedChainId,
      amountPerInterval,
      interval,
      autoExecute: autoExecute ?? false,
      status: 'active',
    },
  });

  // Fire-and-forget: start the agent loop
  startAgentLoop(id).catch((err) => console.error('[strategies] startAgentLoop failed:', err));

  return NextResponse.json(toStrategyResponse(strategy), { status: 201 });
}
