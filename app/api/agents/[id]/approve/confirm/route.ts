import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E } from '@/lib/api-response';
import { markProposalExecuted, toExecutionResponse } from '@/lib/agent-service';
import { resolveUserOperation } from '@/lib/world-userop';

type ConfirmApprovalResponse =
  | {
      success: true;
      txHash: string;
    }
  | {
      success: false;
      pending: true;
    };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ConfirmApprovalResponse | { error: string }>> {
  let userId: string;
  try {
    userId = await getSessionUserId(req);
  } catch (err) {
    if (err instanceof AuthError) return E.unauthorized(err.message);
    return E.internal();
  }

  let proposalId: string;
  let userOpHash: string;
  try {
    ({ proposalId, userOpHash } = await req.json());
  } catch {
    return E.badRequest('Invalid JSON');
  }

  if (!proposalId) return E.badRequest('proposalId is required');
  if (!userOpHash) return E.badRequest('userOpHash is required');

  const { id: agentId } = await params;
  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: {
      agent: true,
      execution: true,
    },
  });

  if (!proposal || proposal.agentId !== agentId || proposal.agent.ownerId !== userId) {
    return E.notFound('Proposal not found');
  }

  if (proposal.execution) {
    return NextResponse.json({
      success: true,
      txHash: toExecutionResponse(proposal.execution).txHash,
    });
  }

  if (proposal.status !== 'approved') {
    return E.conflict('Proposal is not awaiting on-chain confirmation');
  }

  let resolution;
  try {
    resolution = await resolveUserOperation(userOpHash);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to confirm the transaction';
    return E.badRequest(message);
  }
  if (resolution.status === 'pending' || !resolution.transactionHash) {
    return NextResponse.json({ success: false, pending: true }, { status: 202 });
  }

  if (resolution.sender && resolution.sender.toLowerCase() !== proposal.agent.walletAddress.toLowerCase()) {
    return E.badRequest('The submitted World Wallet transaction does not match this agent');
  }

  if (resolution.status === 'failed') {
    await db.proposal.update({
      where: { id: proposalId },
      data: { status: 'pending' },
    });
    return E.badRequest('World Wallet transaction failed');
  }

  try {
    await markProposalExecuted(proposalId, {
      agentId: proposal.agentId,
      strategyId: proposal.strategyId,
      txHash: resolution.transactionHash,
      amountIn: proposal.amount,
      amountOut: proposal.estimatedOutput,
      status: 'confirmed',
    });
  } catch {
    const existingExecution = await db.execution.findUnique({
      where: { proposalId },
    });
    if (existingExecution) {
      return NextResponse.json({
        success: true,
        txHash: toExecutionResponse(existingExecution).txHash,
      });
    }
    throw new Error('Failed to persist execution');
  }

  return NextResponse.json({
    success: true,
    txHash: resolution.transactionHash,
  });
}
