import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E } from '@/lib/api-response';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
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

  await db.proposal.update({ where: { id: proposalId }, data: { status: 'rejected' } });

  return NextResponse.json({ success: true });
}
