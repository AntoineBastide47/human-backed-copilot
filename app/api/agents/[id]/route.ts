import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E } from '@/lib/api-response';
import { toAgentResponse } from '@/lib/agent-service';
import { startAgentLoop, stopAgentLoop } from '@/services/agent-runtime';
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

export async function PATCH(
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

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return E.badRequest('Invalid JSON');
  }

  const { status } = body;
  if (status !== 'paused' && status !== 'active') {
    return E.badRequest('status must be "paused" or "active"');
  }
  if (agent.status === status) {
    return E.conflict(`Agent is already ${status}`);
  }
  if (agent.status === 'registering') {
    return E.conflict('Cannot pause or resume an agent that is still registering');
  }

  const updated = await db.agent.update({
    where: { id },
    data: { status },
  });

  if (status === 'paused') {
    stopAgentLoop(id).catch((err) => console.error('[agents] stopAgentLoop failed:', err));
  } else {
    startAgentLoop(id).catch((err) => console.error('[agents] startAgentLoop failed:', err));
  }

  return NextResponse.json(toAgentResponse(updated));
}
