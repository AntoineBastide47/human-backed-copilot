import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E, isValidAddress } from '@/lib/api-response';
import { toAgentResponse } from '@/lib/agent-service';
import { registerAgent } from '@/services/agentkit';
import type { CreateAgentInput, Agent } from '@/types';

export async function GET(req: Request): Promise<NextResponse<Agent[] | { error: string }>> {
  let userId: string;
  try {
    userId = await getSessionUserId(req);
  } catch (err) {
    if (err instanceof AuthError) return E.unauthorized(err.message);
    return E.internal();
  }

  const agents = await db.agent.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(agents.map(toAgentResponse));
}

export async function POST(req: Request): Promise<NextResponse<Agent | { error: string }>> {
  let userId: string;
  try {
    userId = await getSessionUserId(req);
  } catch (err) {
    if (err instanceof AuthError) return E.unauthorized(err.message);
    return E.internal();
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return E.unauthorized();
  if (!user.isVerified) return E.forbidden('World ID verification required');

  let body: CreateAgentInput;
  try {
    body = await req.json();
  } catch {
    return E.badRequest('Invalid JSON');
  }

  const { walletAddress, spendLimits } = body;
  if (!walletAddress || !isValidAddress(walletAddress)) {
    return E.badRequest('Invalid walletAddress');
  }

  const agent = await db.agent.create({
    data: {
      ownerId: userId,
      walletAddress,
      status: 'registering',
      spendLimits: spendLimits ?? { maxPerTx: '1000000', dailyCap: '5000000' },
    },
  });

  // Fire-and-forget: update status once AgentBook confirms registration
  registerAgent(walletAddress)
    .then(({ registered }) => {
      if (registered) {
        return db.agent.update({ where: { id: agent.id }, data: { status: 'active' } });
      }
    })
    .catch((err) => console.error('[agents] registerAgent failed:', err));

  return NextResponse.json(toAgentResponse(agent), { status: 201 });
}
