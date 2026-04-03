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

  await db.proposal.update({ where: { id: proposalId }, data: { status: 'rejected' } });

  return NextResponse.json({ success: true });
}
