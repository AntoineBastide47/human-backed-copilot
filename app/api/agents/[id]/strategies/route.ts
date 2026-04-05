import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E, isValidAddress } from '@/lib/api-response';
import { toStrategyResponse } from '@/lib/agent-service';
import { runAgentCycleOnce, startAgentLoop, stopAgentLoop } from '@/services/agent-runtime';
import { getQuote } from '@/services/uniswap';
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
  const agent = await assertOwnership(id, userId);
  if (!agent) return E.notFound('Agent not found');
  if (agent.status === 'registering') return E.conflict('Agent is still registering with AgentBook');

  let body: CreateStrategyInput;
  try {
    body = await req.json();
  } catch {
    return E.badRequest('Invalid JSON');
  }

  const {
    name, tokenIn, tokenOut, amountPerInterval, interval, autoExecute, chainId,
    strategyType, targetAllocationBps, rebalanceBandBps, maxSlippageBps,
    minNotionalUsd, cooldownMinutes,
  } = body;

  const resolvedType = strategyType ?? 'dca';
  if (resolvedType !== 'dca' && resolvedType !== 'rebalance') {
    return E.badRequest('strategyType must be "dca" or "rebalance"');
  }

  if (!name?.trim()) return E.badRequest('name is required');
  if (!isValidAddress(tokenIn)) return E.badRequest('Invalid tokenIn address');
  if (!isValidAddress(tokenOut)) return E.badRequest('Invalid tokenOut address');
  if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) return E.badRequest('tokenIn and tokenOut must differ');
  if (!VALID_INTERVALS.has(interval)) return E.badRequest('interval must be hourly, daily, or weekly');
  if (autoExecute) {
    return E.badRequest('Auto-execute is unavailable when trades must be signed by the World Wallet');
  }

  if (resolvedType === 'dca') {
    if (!amountPerInterval) return E.badRequest('amountPerInterval is required');
    try {
      if (BigInt(amountPerInterval) <= BigInt(0)) return E.badRequest('amountPerInterval must be positive');
    } catch {
      return E.badRequest('amountPerInterval must be a valid integer string');
    }
  }

  if (resolvedType === 'rebalance') {
    if (targetAllocationBps == null || targetAllocationBps < 0 || targetAllocationBps > 10000) {
      return E.badRequest('targetAllocationBps must be 0–10000 for rebalance strategies');
    }
    if (rebalanceBandBps == null || rebalanceBandBps < 0 || rebalanceBandBps > 5000) {
      return E.badRequest('rebalanceBandBps must be 0–5000 for rebalance strategies');
    }
  }

  const resolvedChainId = chainId ?? WORLD_CHAIN_ID;
  if (resolvedChainId !== WORLD_CHAIN_ID) return E.badRequest(`Only World Chain (${WORLD_CHAIN_ID}) is supported`);

  if (resolvedType === 'dca') {
    try {
      const quote = await getQuote({
        tokenIn,
        tokenOut,
        chainId: resolvedChainId,
        amount: amountPerInterval,
      }, { swapper: agent.walletAddress });

      if (quote.txFailureReason) {
        return E.badRequest(`Strategy is not quotable right now: ${quote.txFailureReason}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('No quotes available') || message.includes('ResourceNotFound')) {
        return E.badRequest('No Uniswap quote is available for this token pair and amount on World Chain');
      }

      console.error('[strategies] quote validation failed:', err);
      return E.badRequest('Unable to validate this strategy with Uniswap right now');
    }
  }

  const strategy = await db.agentStrategy.create({
    data: {
      agentId: id,
      name: name.trim(),
      tokenIn,
      tokenOut,
      chainId: resolvedChainId,
      amountPerInterval: amountPerInterval || '0',
      interval,
      autoExecute: autoExecute ?? false,
      status: 'active',
      strategyType: resolvedType,
      targetAllocationBps: targetAllocationBps ?? null,
      rebalanceBandBps: rebalanceBandBps ?? null,
      maxSlippageBps: maxSlippageBps ?? null,
      minNotionalUsd: minNotionalUsd ?? null,
      cooldownMinutes: cooldownMinutes ?? null,
    },
  });

  try {
    await runAgentCycleOnce(id);
  } catch (err) {
    console.error('[strategies] immediate cycle failed:', err);
  }

  // Fire-and-forget: keep the loop warm in long-lived processes.
  startAgentLoop(id, { runImmediately: false }).catch((err) =>
    console.error('[strategies] startAgentLoop failed:', err),
  );

  return NextResponse.json(toStrategyResponse(strategy), { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ deleted: true; strategiesDeleted: number } | { error: string }>> {
  let userId: string;
  try {
    userId = await getSessionUserId(req);
  } catch (err) {
    if (err instanceof AuthError) return E.unauthorized(err.message);
    return E.internal();
  }

  const { id } = await params;
  const agent = await assertOwnership(id, userId);
  if (!agent) return E.notFound('Agent not found');

  const strategies = await db.agentStrategy.findMany({
    where: { agentId: id },
    select: { id: true },
  });
  const strategyIds = strategies.map((strategy) => strategy.id);

  await db.$transaction(async (tx) => {
    await tx.execution.deleteMany({ where: { strategyId: { in: strategyIds } } });
    await tx.proposal.deleteMany({ where: { strategyId: { in: strategyIds } } });
    await tx.agentStrategy.deleteMany({ where: { agentId: id } });
  });

  await stopAgentLoop(id).catch((err) => console.error('[strategies] stopAgentLoop failed:', err));

  return NextResponse.json({ deleted: true, strategiesDeleted: strategyIds.length });
}
