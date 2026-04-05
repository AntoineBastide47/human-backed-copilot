import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E, isValidAddress } from '@/lib/api-response';
import { toAgentResponse } from '@/lib/agent-service';
import { verifyAgentIsHuman } from '@/services/agentkit';
import { DEFAULT_SPEND_LIMITS } from '@/lib/spend-limits';
import {
  isAgentEnsAvailable,
  isAgentEnsRegistrationConfigured,
  registerAgentENS,
} from '@/lib/ens';
import { normalizeAgentEnsLabel } from '@/lib/ens-name';
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

  const { ensName, spendLimits } = body;
  const walletAddress = user.walletAddress.trim();
  if (!walletAddress || !isValidAddress(walletAddress)) {
    return E.forbidden('Verified World wallet address missing. Verify with World App again.');
  }
  const requestedEnsLabel = normalizeAgentEnsLabel(ensName, walletAddress);
  let resolvedEnsName: string | null = null;

  if (!isDemoMode) {
    const isRegistered = await verifyAgentIsHuman(walletAddress);
    if (!isRegistered) {
      return E.forbidden(
        `Agent wallet is not registered in AgentBook. Run: npx @worldcoin/agentkit-cli register ${walletAddress}`,
      );
    }
  }

  if (isAgentEnsRegistrationConfigured()) {
    const availability = await isAgentEnsAvailable(walletAddress, requestedEnsLabel);
    if (!availability.available) {
      return E.conflict(`ENS name ${availability.ensName} is already taken`);
    }

    try {
      resolvedEnsName = await registerAgentENS(
        walletAddress,
        {
          strategy: 'dca',
          worldIdVerified: user.isVerified,
          owner: user.walletAddress,
        },
        requestedEnsLabel,
      );
    } catch (err) {
      console.error('[ENS] registerAgentENS failed:', err);
      return E.badRequest('Unable to register ENS name right now');
    }
  }

  const agent = await db.agent.create({
    data: {
      ownerId: userId,
      walletAddress,
      ensName: resolvedEnsName,
      status: 'active',
      agentbookRegId: null,
      spendLimits: spendLimits ?? DEFAULT_SPEND_LIMITS,
    },
  });

  return NextResponse.json(toAgentResponse(agent), { status: 201 });
}
