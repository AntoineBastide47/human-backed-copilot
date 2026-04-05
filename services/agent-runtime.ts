import { getQuote, resolveQuoteAmountOut } from './uniswap';
import {
  getAgentStrategies,
  createProposal,
  getRecentProposal,
} from '@/lib/agent-service';
import { db } from '@/lib/db';
import type { AgentStrategy } from '@/types';

const CYCLE_INTERVAL_MS = 60_000;

const INTERVAL_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

const activeLoops = new Map<string, NodeJS.Timeout>();

export function isLoopActive(agentId: string): boolean {
  return activeLoops.has(agentId);
}

export async function startAgentLoop(
  agentId: string,
  options: { runImmediately?: boolean } = {},
): Promise<void> {
  if (activeLoops.has(agentId)) return;
  const { runImmediately = true } = options;

  // Register a placeholder so duplicate calls are blocked during the first cycle
  const interval = setInterval(async () => {
    try {
      await runCycle(agentId);
    } catch (err) {
      console.error(`[agent-runtime] cycle error for ${agentId}:`, err);
    }
  }, CYCLE_INTERVAL_MS);

  activeLoops.set(agentId, interval);

  // Run first cycle immediately; if it stops the loop (e.g. agent paused), that's fine
  if (runImmediately) {
    await runCycle(agentId);
  }
}

export async function runAgentCycleOnce(agentId: string): Promise<void> {
  await runCycle(agentId);
}

export async function stopAgentLoop(agentId: string): Promise<void> {
  const interval = activeLoops.get(agentId);
  if (interval) {
    clearInterval(interval);
    activeLoops.delete(agentId);
  }
}

async function runCycle(agentId: string): Promise<void> {
  await syncAgentProposalsOnce(agentId);
}

export async function syncAgentProposalsOnce(agentId: string): Promise<void> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { status: true, walletAddress: true },
  });
  if (!agent || agent.status !== 'active') {
    if (agent?.status === 'paused') {
      await stopAgentLoop(agentId);
    }
    return;
  }

  const strategies = await getAgentStrategies(agentId);

  for (const strategy of strategies) {
    if (strategy.status !== 'active') continue;
    if (!(await shouldExecuteNow(strategy))) continue;

    try {
      await processStrategy(agentId, strategy, agent.walletAddress);
    } catch (err) {
      console.error(
        `[agent-runtime] strategy ${strategy.id} failed:`,
        err,
      );
    }
  }
}

async function processStrategy(
  agentId: string,
  strategy: AgentStrategy,
  walletAddress: string,
): Promise<void> {
  // Deduplicate: skip if a pending/approved proposal already exists for this strategy
  const existing = await getRecentProposal(
    agentId,
    strategy.id,
    INTERVAL_MS[strategy.interval] ?? CYCLE_INTERVAL_MS,
  );
  if (existing) return;

  const quote = await getQuote({
    tokenIn: strategy.tokenIn,
    tokenOut: strategy.tokenOut,
    chainId: strategy.chainId,
    amount: strategy.amountPerInterval,
  }, { swapper: walletAddress });

  const estimatedOutput = resolveQuoteAmountOut(quote.quote, strategy.tokenOut);

  const reasoning = strategy.autoExecute
    ? `Auto-execute requested for ${strategy.name}, but World Wallet execution still requires confirmation`
    : `DCA: ${strategy.name} — awaiting approval`;

  await createProposal({
    agentId,
    strategyId: strategy.id,
    type: 'dca_buy',
    tokenIn: strategy.tokenIn,
    tokenOut: strategy.tokenOut,
    amount: strategy.amountPerInterval,
    estimatedOutput,
    reasoning,
    status: 'pending',
  });
}

async function shouldExecuteNow(strategy: AgentStrategy): Promise<boolean> {
  if (process.env.DEMO_MODE === 'true') return true;

  const intervalMs = INTERVAL_MS[strategy.interval];
  if (!intervalMs) return true;

  const lastExecTime = await getLastExecutionForStrategy(strategy.id);
  if (!lastExecTime) return true;

  return Date.now() - lastExecTime.getTime() >= intervalMs;
}

// TODO: Request P1 to move to lib/agent-service.ts
async function getLastExecutionForStrategy(
  strategyId: string,
): Promise<Date | null> {
  const execution = await db.execution.findFirst({
    where: { strategyId },
    orderBy: { executedAt: 'desc' },
    select: { executedAt: true },
  });
  return execution?.executedAt ?? null;
}

export function _resetForTesting(): void {}

export { CYCLE_INTERVAL_MS };
