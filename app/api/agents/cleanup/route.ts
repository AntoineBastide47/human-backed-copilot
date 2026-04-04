import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E } from '@/lib/api-response';
import { stopAgentLoop } from '@/services/agent-runtime';

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const STRATEGY_CLEANUP_SCOPE = 'strategies';

function getCleanupSecret(req: Request): string | null {
  const bearer = req.headers.get('authorization');
  if (bearer?.startsWith('Bearer ')) {
    return bearer.slice('Bearer '.length).trim();
  }

  return req.headers.get('x-agent-cleanup-secret');
}

async function deleteAllStrategies(req: Request) {
  const expectedSecret = process.env.AGENT_CLEANUP_SECRET;
  if (!expectedSecret) {
    console.error('[agents/cleanup] AGENT_CLEANUP_SECRET is not set');
    return E.internal();
  }

  if (getCleanupSecret(req) !== expectedSecret) {
    return E.forbidden('Invalid cleanup secret');
  }

  const strategies = await db.agentStrategy.findMany({
    select: { id: true, agentId: true },
  });

  const strategyIds = strategies.map((strategy) => strategy.id);
  const affectedAgentIds = [...new Set(strategies.map((strategy) => strategy.agentId))];

  const { executionsDeleted, proposalsDeleted, strategiesDeleted } = await db.$transaction(async (tx) => {
    const executions = await tx.execution.deleteMany({
      where: { strategyId: { in: strategyIds } },
    });
    const proposals = await tx.proposal.deleteMany({
      where: { strategyId: { in: strategyIds } },
    });
    const agentStrategies = await tx.agentStrategy.deleteMany({
      where: { id: { in: strategyIds } },
    });

    return {
      executionsDeleted: executions.count,
      proposalsDeleted: proposals.count,
      strategiesDeleted: agentStrategies.count,
    };
  });

  await Promise.all(
    affectedAgentIds.map((agentId) =>
      stopAgentLoop(agentId).catch((err) =>
        console.error(`[agents/cleanup] stopAgentLoop failed for ${agentId}:`, err),
      ),
    ),
  );

  return NextResponse.json({
    deleted: true,
    scope: STRATEGY_CLEANUP_SCOPE,
    executionsDeleted,
    proposalsDeleted,
    strategiesDeleted,
    agentsAffected: affectedAgentIds.length,
  });
}

export async function DELETE(req: Request) {
  const scope = new URL(req.url).searchParams.get('scope');
  if (scope === STRATEGY_CLEANUP_SCOPE) {
    return deleteAllStrategies(req);
  }

  let userId: string;
  try {
    userId = await getSessionUserId(req);
  } catch (err) {
    if (err instanceof AuthError) return E.unauthorized(err.message);
    return E.internal();
  }

  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

  const { count } = await db.agent.deleteMany({
    where: {
      ownerId: userId,
      status: 'registering',
      createdAt: { lt: cutoff },
    },
  });

  return NextResponse.json({ deleted: count });
}
