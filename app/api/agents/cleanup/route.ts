import { NextResponse } from 'next/server';
import { getSessionUserId, AuthError } from '@/lib/auth';
import { db } from '@/lib/db';
import { E } from '@/lib/api-response';

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

export async function DELETE(req: Request) {
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
