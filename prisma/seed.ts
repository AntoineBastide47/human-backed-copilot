/**
 * Demo seed — run with: prisma db seed
 *
 * Creates a reproducible showcase state:
 *   1 verified user · 1 active agent · 3 strategies ·
 *   8 confirmed executions · 2 pending proposals ready for approval
 *
 * Safe to re-run: clears all rows before inserting fresh data.
 */
import { PrismaClient } from '@prisma/client';
import {
  DEMO_USER,
  DEMO_AGENT,
  DEMO_STRATEGIES,
  DEMO_EXECUTIONS,
  DEMO_PROPOSALS,
  makeTxHash,
  daysAgo,
} from './seed-fixtures';

const prisma = new PrismaClient();

async function main() {
  // ── Wipe in dependency order ───────────────────────────────────────────────
  await prisma.execution.deleteMany();
  await prisma.proposal.deleteMany();
  await prisma.agentStrategy.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.user.deleteMany();

  // ── User ───────────────────────────────────────────────────────────────────
  const user = await prisma.user.create({ data: DEMO_USER });

  // ── Agent ──────────────────────────────────────────────────────────────────
  const agent = await prisma.agent.create({
    data: { ...DEMO_AGENT, ownerId: user.id },
  });

  // ── Strategies ────────────────────────────────────────────────────────────
  const strategies = await Promise.all(
    DEMO_STRATEGIES.map((s) =>
      prisma.agentStrategy.create({ data: { ...s, agentId: agent.id } })
    )
  );

  // ── Historical executions (each needs a proposal + an execution) ──────────
  for (const ex of DEMO_EXECUTIONS) {
    const strategy = strategies[ex.strategyIdx];
    const executedAt = daysAgo(ex.daysBack);

    const proposal = await prisma.proposal.create({
      data: {
        agentId: agent.id,
        strategyId: strategy.id,
        type: 'dca_buy',
        tokenIn: strategy.tokenIn,
        tokenOut: strategy.tokenOut,
        amount: ex.amountIn,
        estimatedOutput: ex.amountOut,
        reasoning: `Scheduled DCA — ${ex.daysBack}d ago`,
        status: 'executed',
        createdAt: new Date(executedAt.getTime() - 60_000), // 1 min before execution
      },
    });

    await prisma.execution.create({
      data: {
        agentId: agent.id,
        strategyId: strategy.id,
        proposalId: proposal.id,
        txHash: makeTxHash(ex.txSeed),
        amountIn: ex.amountIn,
        amountOut: ex.amountOut,
        status: 'confirmed',
        executedAt,
      },
    });
  }

  // ── Pending proposals ready for demo approval ─────────────────────────────
  for (const p of DEMO_PROPOSALS) {
    const strategy = strategies[p.strategyIdx];
    await prisma.proposal.create({
      data: {
        agentId: agent.id,
        strategyId: strategy.id,
        type: p.type,
        tokenIn: p.tokenIn,
        tokenOut: p.tokenOut,
        amount: p.amount,
        estimatedOutput: p.estimatedOutput,
        reasoning: p.reasoning,
        status: 'pending',
      },
    });
  }

  console.log('Seed complete:');
  console.log(`  user    ${user.id}`);
  console.log(`  agent   ${agent.id}  (${agent.status})`);
  console.log(`  strategies  ${strategies.length}`);
  console.log(`  executions  ${DEMO_EXECUTIONS.length}`);
  console.log(`  proposals   ${DEMO_PROPOSALS.length} pending`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
