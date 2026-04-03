import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E } from '@/lib/api-response';
import { markProposalExecuted } from '@/lib/agent-service';
import { executeSwap } from '@/services/uniswap';
import { WORLD_CHAIN_ID } from '@/lib/constants';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ success: boolean; txHash?: string } | { error: string }>> {
  let userId: string;
  try {
    userId = await getSessionUserId(req);
  } catch (err) {
    if (err instanceof AuthError) return E.unauthorized(err.message);
    return E.internal();
  }

  let proposalId: string;
  try {
    ({ proposalId } = await req.json());
  } catch {
    return E.badRequest('Invalid JSON');
  }
  if (!proposalId) return E.badRequest('proposalId is required');

  const { id: agentId } = await params;

  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: { agent: true },
  });

  if (!proposal || proposal.agentId !== agentId || proposal.agent.ownerId !== userId) {
    return E.notFound('Proposal not found');
  }
  if (proposal.status !== 'pending') return E.conflict('Proposal already processed');
  if (proposal.agent.status !== 'active') return E.conflict('Agent is not active');

  // Spend limit enforcement
  const limits = proposal.agent.spendLimits as { maxPerTx?: string; dailyCap?: string } | null;
  if (limits?.maxPerTx) {
    try {
      if (BigInt(proposal.amount) > BigInt(limits.maxPerTx)) {
        return E.badRequest(
          `Amount ${proposal.amount} exceeds maxPerTx limit ${limits.maxPerTx}`
        );
      }
    } catch {
      // Non-numeric amount — fail safe
      return E.badRequest('Invalid proposal amount');
    }
  }

  // Optimistic lock: atomically claim the proposal from 'pending' → 'approved'.
  // If another request already moved it, count will be 0.
  const { count } = await db.proposal.updateMany({
    where: { id: proposalId, status: 'pending' },
    data: { status: 'approved' },
  });
  if (count === 0) return E.conflict('Proposal is already being processed');

  // Execute the swap
  const result = await executeSwap({
    tokenIn: proposal.tokenIn,
    tokenOut: proposal.tokenOut,
    chainId: WORLD_CHAIN_ID,
    amount: proposal.amount,
  });

  if (!result.success) {
    // Rollback proposal so the user can retry
    await db.proposal.update({
      where: { id: proposalId },
      data: { status: 'pending' },
    });
    return E.badRequest(result.error ?? 'Swap execution failed');
  }

  await markProposalExecuted(proposalId, {
    agentId: proposal.agentId,
    strategyId: proposal.strategyId,
    txHash: result.txHash ?? '',
    amountIn: result.amountIn,
    amountOut: result.amountOut,
    status: 'confirmed',
  });

  return NextResponse.json({ success: true, txHash: result.txHash });
}
