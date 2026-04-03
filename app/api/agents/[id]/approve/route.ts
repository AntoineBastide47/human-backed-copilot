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

  const { id: agentId } = await params;
  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.ownerId !== userId) return E.notFound('Agent not found');

  let body: { proposalId: string };
  try {
    body = await req.json();
  } catch {
    return E.badRequest('Invalid JSON');
  }

  const { proposalId } = body;
  if (!proposalId) return E.badRequest('proposalId is required');

  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal || proposal.agentId !== agentId) return E.notFound('Proposal not found');
  if (proposal.status !== 'pending') return E.conflict(`Proposal is already ${proposal.status}`);

  // Update status to approved first
  await db.proposal.update({ where: { id: proposalId }, data: { status: 'approved' } });

  // Execute the swap on-chain
  const result = await executeSwap({
    tokenIn: proposal.tokenIn,
    tokenOut: proposal.tokenOut,
    amount: proposal.amount,
    chainId: WORLD_CHAIN_ID,
  });

  if (!result.success || !result.txHash) {
    // Revert to pending so the user can retry
    await db.proposal.update({ where: { id: proposalId }, data: { status: 'pending' } });
    return E.internal();
  }

  await markProposalExecuted(proposalId, {
    agentId,
    strategyId: proposal.strategyId,
    txHash: result.txHash,
    amountIn: result.amountIn,
    amountOut: result.amountOut,
    status: 'confirmed',
  });

  return NextResponse.json({ success: true, txHash: result.txHash });
}
