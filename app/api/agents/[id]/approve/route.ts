import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E } from '@/lib/api-response';
import {
  prepareUserSwap,
  getCurrentPermit2Allowance,
  type PreparedTransaction,
} from '@/services/uniswap';
import { WORLD_CHAIN_ID } from '@/lib/constants';
import {
  formatUsdcAmount,
  getProposalUsdcNotional,
  normalizeSpendLimits,
} from '@/lib/spend-limits';

interface PrepareApprovalResponse {
  success: true;
  transactions: PreparedTransaction[];
  amountIn: string;
  amountOut: string;
  approvalNeeded: boolean;
  debug: {
    walletAddress: string;
    transactionTargets: string[];
    tokenIn: string;
    spender: string | null;
    currentAllowance: string | null;
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<PrepareApprovalResponse | { error: string }>> {
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
  const limits = normalizeSpendLimits(
    proposal.agent.spendLimits as { maxPerTx?: string; dailyCap?: string } | null,
  );
  if (limits.maxPerTx !== '0') {
    try {
      const proposalNotional = getProposalUsdcNotional(proposal);
      if (proposalNotional > BigInt(limits.maxPerTx)) {
        return E.badRequest(
          `Trade size ${formatUsdcAmount(proposalNotional)} exceeds maxPerTx limit ${formatUsdcAmount(limits.maxPerTx)}`
        );
      }
    } catch {
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

  try {
    const prepared = await prepareUserSwap(
      {
        tokenIn: proposal.tokenIn,
        tokenOut: proposal.tokenOut,
        chainId: WORLD_CHAIN_ID,
        amount: proposal.amount,
      },
      proposal.agent.walletAddress,
    );
    const transactionTargets = prepared.transactions.map((tx) => tx.to);
    const spender = transactionTargets.at(-1) ?? null;
    let currentAllowance: string | null = null;

    if (spender) {
      try {
        currentAllowance = (
          await getCurrentPermit2Allowance(
            proposal.tokenIn,
            proposal.agent.walletAddress,
            spender,
          )
        ).toString();
      } catch {
        currentAllowance = null;
      }
    }

    return NextResponse.json({
      success: true,
      transactions: prepared.transactions,
      amountIn: prepared.amountIn,
      amountOut: prepared.amountOut,
      approvalNeeded: prepared.approvalNeeded,
      debug: {
        walletAddress: proposal.agent.walletAddress,
        transactionTargets,
        tokenIn: proposal.tokenIn,
        spender,
        currentAllowance,
      },
    });
  } catch (err) {
    await db.proposal.update({
      where: { id: proposalId },
      data: { status: 'pending' },
    });

    const message = err instanceof Error ? err.message : 'Swap preparation failed';
    return E.badRequest(message);
  }
}
