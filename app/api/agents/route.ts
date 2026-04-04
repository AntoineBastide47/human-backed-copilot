import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E, isValidAddress } from '@/lib/api-response';
import { toAgentResponse } from '@/lib/agent-service';
import { verifyAgentIsHuman } from '@/services/agentkit';
import { DEFAULT_SPEND_LIMITS } from '@/lib/spend-limits';
import type { Agent } from '@/types';

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

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

interface CreateBody {
  walletAddress: string;
  ensName?: string;
  spendLimits?: { maxPerTx: string; dailyCap: string };
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

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return E.badRequest('Invalid JSON');
  }

  const { walletAddress, ensName, spendLimits } = body;
  if (!walletAddress || !isValidAddress(walletAddress)) {
    return E.badRequest('Invalid walletAddress');
  }

  if (!isDemoMode) {
    const isRegistered = await verifyAgentIsHuman(walletAddress);
    if (!isRegistered) {
      return E.forbidden(
        `Agent wallet is not registered in AgentBook. Run: npx @worldcoin/agentkit-cli register ${walletAddress}`,
      );
    }
  }

  const agent = await db.agent.create({
    data: {
      ownerId: userId,
      walletAddress,
      ensName: ensName || null,
      status: 'active',
      agentbookRegId: null,
      spendLimits: spendLimits ?? DEFAULT_SPEND_LIMITS,
    },
  });

  return NextResponse.json(toAgentResponse(agent), { status: 201 });
}
