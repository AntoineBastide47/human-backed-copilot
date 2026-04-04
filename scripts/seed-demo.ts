/**
 * Seed demo state for Sync #4 and the live demo.
 * Creates: 1 verified user, 1 active agent, 2 strategies,
 * 8 confirmed executions, 2 pending proposals.
 *
 * Usage: npx tsx scripts/seed-demo.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  console.log('[seed-demo] seeding...');

  // 1. Verified user
  const user = await prisma.user.upsert({
    where: { nullifierHash: 'demo-nullifier-hash-001' },
    create: {
      nullifierHash: 'demo-nullifier-hash-001',
      walletAddress: process.env.PAY_TO ?? '0x0000000000000000000000000000000000000001',
      verificationLevel: 'orb',
      isVerified: true,
    },
    update: { isVerified: true },
  });
  console.log(`[seed-demo] user: ${user.id}`);

  // 2. Active agent
  const agent = await prisma.agent.upsert({
    where: { id: 'demo-agent-001' },
    create: {
      id: 'demo-agent-001',
      ownerId: user.id,
      walletAddress: process.env.PAY_TO ?? '0x0000000000000000000000000000000000000001',
      status: 'active',
      usageCount: 8,
      freeTrialRemaining: 3,
      spendLimits: { maxPerTx: '1000000000000000000', dailyCap: '5000000000000000000' },
    },
    update: { status: 'active' },
  });
  console.log(`[seed-demo] agent: ${agent.id}`);

  // 3. Strategies
  const dailyDCA = await prisma.agentStrategy.upsert({
    where: { id: 'demo-strat-daily' },
    create: {
      id: 'demo-strat-daily',
      agentId: agent.id,
      name: 'Daily WETH → USDC',
      tokenIn: WETH,
      tokenOut: USDC,
      chainId: 480,
      amountPerInterval: '500000000000000000', // 0.5 WETH
      interval: 'daily',
      autoExecute: false,
      status: 'active',
    },
    update: {},
  });

  const weeklyDCA = await prisma.agentStrategy.upsert({
    where: { id: 'demo-strat-weekly' },
    create: {
      id: 'demo-strat-weekly',
      agentId: agent.id,
      name: 'Weekly USDC → WETH',
      tokenIn: USDC,
      tokenOut: WETH,
      chainId: 480,
      amountPerInterval: '1000000000', // 1000 USDC
      interval: 'weekly',
      autoExecute: true,
      status: 'active',
    },
    update: {},
  });
  console.log(`[seed-demo] strategies: ${dailyDCA.id}, ${weeklyDCA.id}`);

  // 4. Past executions (8 confirmed)
  const now = Date.now();
  const DAY = 86_400_000;
  for (let i = 0; i < 8; i++) {
    const execId = `demo-exec-${String(i).padStart(3, '0')}`;
    const propId = `demo-prop-exec-${String(i).padStart(3, '0')}`;
    const daysAgo = (8 - i) * DAY;

    await prisma.proposal.upsert({
      where: { id: propId },
      create: {
        id: propId,
        agentId: agent.id,
        strategyId: dailyDCA.id,
        type: 'dca_buy',
        tokenIn: WETH,
        tokenOut: USDC,
        amount: '500000000000000000',
        estimatedOutput: String(900_000_000 + i * 5_000_000), // ~900-940 USDC
        reasoning: `DCA #${i + 1}: Daily WETH → USDC`,
        status: 'executed',
        createdAt: new Date(now - daysAgo),
      },
      update: {},
    });

    await prisma.execution.upsert({
      where: { id: execId },
      create: {
        id: execId,
        agentId: agent.id,
        strategyId: dailyDCA.id,
        proposalId: propId,
        txHash: `0x${execId.replace(/-/g, '').padEnd(64, 'a')}`,
        amountIn: '500000000000000000',
        amountOut: String(900_000_000 + i * 5_000_000),
        status: 'confirmed',
        executedAt: new Date(now - daysAgo + 60_000), // 1 min after proposal
      },
      update: {},
    });
  }
  console.log('[seed-demo] 8 past executions created');

  // 5. Pending proposals for live demo
  for (let i = 0; i < 2; i++) {
    const id = `demo-prop-pending-${i}`;
    await prisma.proposal.upsert({
      where: { id },
      create: {
        id,
        agentId: agent.id,
        strategyId: dailyDCA.id,
        type: 'dca_buy',
        tokenIn: WETH,
        tokenOut: USDC,
        amount: '500000000000000000',
        estimatedOutput: '945000000',
        reasoning: i === 0
          ? 'DCA #9: Daily WETH → USDC — awaiting approval'
          : 'DCA #10: Daily WETH → USDC — awaiting approval',
        status: 'pending',
      },
      update: {},
    });
  }
  console.log('[seed-demo] 2 pending proposals created');

  console.log('\n[seed-demo] done. Demo state:');
  console.log(`  User ID:  ${user.id}`);
  console.log(`  Agent ID: ${agent.id}`);
  console.log('  Store agent ID in localStorage: hbc_agentId = demo-agent-001');
}

main()
  .catch((err) => {
    console.error('[seed-demo] error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
