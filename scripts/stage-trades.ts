/**
 * Pre-execute 2 real trades on World Chain so confirmed tx hashes exist.
 * Run AFTER the wallet is funded with gas + WETH.
 *
 * Usage: npx tsx scripts/stage-trades.ts
 */
const REQUIRED_ENV = ['DATABASE_URL', 'WALLET_PRIVATE_KEY', 'WORLD_CHAIN_RPC', 'UNISWAP_API_KEY'] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[stage-trades] Missing required env var: ${key}`);
    process.exit(1);
  }
}

const { executeSwap } = await import('../services/uniswap');
const { PrismaClient } = await import('@prisma/client');

const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';
const AMOUNT = '100000000000000000'; // 0.1 WETH — small to conserve funds

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.$connect();

  // Find the demo agent (from seed-demo)
  const agent = await prisma.agent.findFirst({
    where: { status: 'active' },
    include: { strategies: { where: { status: 'active' }, take: 1 } },
  });

  if (!agent) {
    console.error('[stage-trades] No active agent found. Run seed-demo.ts first.');
    process.exit(1);
  }

  const strategyId = agent.strategies[0]?.id ?? 'manual-trade';
  console.log(`[stage-trades] using agent ${agent.id}, strategy ${strategyId}`);

  for (let i = 0; i < 2; i++) {
    console.log(`\n[stage-trades] executing trade ${i + 1}/2...`);

    const result = await executeSwap({
      tokenIn: WETH,
      tokenOut: USDC,
      chainId: 480,
      amount: AMOUNT,
    });

    if (!result.success) {
      console.error(`[stage-trades] trade ${i + 1} failed:`, result.error);
      continue;
    }

    console.log(`[stage-trades] trade ${i + 1} success: ${result.txHash}`);

    // Persist as a real execution
    const proposal = await prisma.proposal.create({
      data: {
        agentId: agent.id,
        strategyId,
        type: 'dca_buy',
        tokenIn: WETH,
        tokenOut: USDC,
        amount: AMOUNT,
        estimatedOutput: result.amountOut,
        reasoning: `Pre-staged trade #${i + 1} for demo`,
        status: 'executed',
      },
    });

    await prisma.execution.create({
      data: {
        agentId: agent.id,
        strategyId,
        proposalId: proposal.id,
        txHash: result.txHash!,
        amountIn: result.amountIn,
        amountOut: result.amountOut,
        status: 'confirmed',
      },
    });

    console.log(`[stage-trades] persisted execution for tx ${result.txHash}`);
  }

  console.log('\n[stage-trades] done');
}

main()
  .catch((err) => {
    console.error('[stage-trades] error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
