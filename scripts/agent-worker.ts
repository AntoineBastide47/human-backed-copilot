/**
 * Standalone agent runtime worker for Railway (always-on process).
 * DO NOT run on Vercel — serverless functions timeout after 10-60s.
 *
 * Usage: npx tsx scripts/agent-worker.ts
 */
import { PrismaClient } from '@prisma/client';

// Validate required env vars before importing anything else
const REQUIRED_ENV = ['DATABASE_URL', 'WALLET_PRIVATE_KEY', 'WORLD_CHAIN_RPC', 'UNISWAP_API_KEY'] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[agent-worker] Missing required env var: ${key}`);
    process.exit(1);
  }
}

// Lazy-import after env validation so module-level singletons init cleanly
const { startAgentLoop, stopAgentLoop, isLoopActive } = await import('../services/agent-runtime');

const prisma = new PrismaClient();
const POLL_INTERVAL_MS = 30_000;
const trackedAgents = new Set<string>();

async function syncActiveAgents(): Promise<void> {
  const agents = await prisma.agent.findMany({
    where: { status: 'active' },
    select: { id: true },
  });

  const activeIds = new Set(agents.map((a) => a.id));

  // Start loops for newly active agents
  for (const { id } of agents) {
    if (!isLoopActive(id)) {
      console.log(`[agent-worker] starting loop for agent ${id}`);
      startAgentLoop(id).catch((err) =>
        console.error(`[agent-worker] failed to start loop for ${id}:`, err),
      );
      trackedAgents.add(id);
    }
  }

  // Stop loops for agents that are no longer active
  for (const id of trackedAgents) {
    if (!activeIds.has(id)) {
      console.log(`[agent-worker] stopping loop for agent ${id} (no longer active)`);
      await stopAgentLoop(id);
      trackedAgents.delete(id);
    }
  }
}

async function main(): Promise<void> {
  console.log('[agent-worker] starting...');
  await prisma.$connect();
  console.log('[agent-worker] database connected');

  // Initial sync
  await syncActiveAgents();

  // Poll for agent status changes
  setInterval(async () => {
    try {
      await syncActiveAgents();
    } catch (err) {
      console.error('[agent-worker] sync error:', err);
    }
  }, POLL_INTERVAL_MS);

  console.log(`[agent-worker] running (poll every ${POLL_INTERVAL_MS / 1000}s)`);
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`[agent-worker] received ${signal}, shutting down...`);
  for (const id of trackedAgents) {
    await stopAgentLoop(id);
  }
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  console.error('[agent-worker] fatal:', err);
  process.exit(1);
});
