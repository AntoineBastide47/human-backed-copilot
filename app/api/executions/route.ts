import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E } from '@/lib/api-response';
import { toExecutionResponse } from '@/lib/agent-service';
import type { Execution } from '@/types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: Request): Promise<NextResponse<Execution[] | { error: string }>> {
  let userId: string;
  try {
    userId = await getSessionUserId(req);
  } catch (err) {
    if (err instanceof AuthError) return E.unauthorized(err.message);
    return E.internal();
  }

  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('agentId');
  if (!agentId) return E.badRequest('agentId query parameter is required');

  // Verify ownership
  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.ownerId !== userId) return E.notFound('Agent not found');

  const cursor = searchParams.get('cursor');
  const rawLimit = searchParams.get('limit');
  const limit = Math.min(
    Math.max(1, rawLimit ? parseInt(rawLimit, 10) || DEFAULT_LIMIT : DEFAULT_LIMIT),
    MAX_LIMIT
  );

  const executions = await db.execution.findMany({
    where: { agentId },
    orderBy: { executedAt: 'desc' },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  return NextResponse.json(executions.map(toExecutionResponse));
}
