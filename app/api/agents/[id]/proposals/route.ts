import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E } from '@/lib/api-response';
import { toProposalResponse } from '@/lib/agent-service';
import { syncAgentProposalsOnce } from '@/services/agent-runtime';
import { getTokenBalances } from '@/services/token-balances';
import type { Proposal } from '@/types';

const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'executed']);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<Proposal[] | { error: string }>> {
  let userId: string;
  try {
    userId = await getSessionUserId(req);
  } catch (err) {
    if (err instanceof AuthError) return E.unauthorized(err.message);
    return E.internal();
  }

  const { id } = await params;

  // Verify ownership without a separate query by checking ownerId inline
  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent || agent.ownerId !== userId) return E.notFound('Agent not found');

  try {
    await syncAgentProposalsOnce(id);
  } catch (err) {
    console.error('[proposals] syncAgentProposalsOnce failed:', err);
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  if (status && !VALID_STATUSES.has(status)) return E.badRequest('Invalid status filter');

  const proposals = await db.proposal.findMany({
    where: { agentId: id, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
  });

  const proposalResponses = proposals.map(toProposalResponse);
  const tokenAddresses = proposalResponses.flatMap((proposal) => [proposal.tokenIn, proposal.tokenOut]);

  try {
    const balances = await getTokenBalances(agent.walletAddress, tokenAddresses);

    return NextResponse.json(
      proposalResponses.map((proposal) => ({
        ...proposal,
        tokenInBalance: balances[proposal.tokenIn.toLowerCase()] ?? '0',
        tokenOutBalance: balances[proposal.tokenOut.toLowerCase()] ?? '0',
      })),
    );
  } catch (err) {
    console.error('[proposals] token balance lookup failed:', err);
    return NextResponse.json(proposalResponses);
  }
}
