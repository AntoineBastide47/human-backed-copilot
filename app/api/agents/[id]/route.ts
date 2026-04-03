import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E } from '@/lib/api-response';
import { toAgentResponse } from '@/lib/agent-service';
import type { Agent } from '@/types';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<Agent | { error: string }>> {
  let userId: string;
  try {
    userId = await getSessionUserId(req);
  } catch (err) {
    if (err instanceof AuthError) return E.unauthorized(err.message);
    return E.internal();
  }

  const { id } = await params;
  const agent = await db.agent.findUnique({ where: { id } });

  if (!agent || agent.ownerId !== userId) return E.notFound('Agent not found');

  return NextResponse.json(toAgentResponse(agent));
}
