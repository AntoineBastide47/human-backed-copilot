import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E } from '@/lib/api-response';
import { toExecutionResponse } from '@/lib/agent-service';
import type { PaginatedResponse, Execution } from '@/types';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(
  req: Request
): Promise<NextResponse<PaginatedResponse<Execution> | { error: string }>> {
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

  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.ownerId !== userId) return E.notFound('Agent not found');

  const rawLimit = parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  const cursor = searchParams.get('cursor') ?? undefined;

  const rows = await db.execution.findMany({
    where: { agentId },
    orderBy: { executedAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  return NextResponse.json({
    data: page.map(toExecutionResponse),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
