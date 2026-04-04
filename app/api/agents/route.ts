import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E, isValidAddress } from '@/lib/api-response';
import { toAgentResponse } from '@/lib/agent-service';
import { registerAgent } from '@/services/agentkit';
import type { CreateAgentInput, Agent } from '@/types';

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

  const { walletAddress, spendLimits, proof } = body;
  if (!walletAddress || !isValidAddress(walletAddress)) {
    return E.badRequest('Invalid walletAddress');
  }

  // Demo mode: skip on-chain registration
  if (isDemoMode) {
    const agent = await db.agent.create({
      data: {
        ownerId: userId,
        walletAddress,
        status: 'active',
        spendLimits: spendLimits ?? { maxPerTx: '1000000', dailyCap: '5000000' },
      },
    });
    return NextResponse.json(toAgentResponse(agent), { status: 201 });
  }

  // Production: require World ID proof for on-chain registration
  if (!proof?.merkle_root || !proof?.nullifier_hash || !proof?.proof) {
    return E.badRequest('World ID proof required for agent registration');
  }

  const agent = await db.agent.create({
    data: {
      ownerId: userId,
      walletAddress,
      status: 'registering',
      spendLimits: spendLimits ?? { maxPerTx: '1000000', dailyCap: '5000000' },
    },
  });

  try {
    const result = await registerAgent(walletAddress, proof);

    const updated = await db.agent.update({
      where: { id: agent.id },
      data: {
        status: 'active',
        agentbookRegId: result.txHash,
      },
    });

    return NextResponse.json(toAgentResponse(updated), { status: 201 });
  } catch (err) {
    console.error('[agents] On-chain registration failed:', err);

    await db.agent.update({
      where: { id: agent.id },
      data: { status: 'registering' },
    });

    return NextResponse.json(
      { error: `Registration failed: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 502 },
    );
  }
}
