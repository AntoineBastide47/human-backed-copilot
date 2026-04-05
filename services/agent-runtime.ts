import { evaluateStrategy } from './strategy-evaluator';
import { getPortfolioSnapshot, getTokenBalances } from './portfolio';
import { getMarketSnapshot, getPriceFromSnapshot, computeUsdcValue } from './market-snapshot';
import { getWalletAddress } from './wallet';
import {
  getAgentStrategies,
  createProposal,
  getRecentProposal,
  getLastExecutionForStrategy,
  updateProposalStatus,
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

  const interval = setInterval(async () => {
    try {
      await runCycle(agentId);
    } catch (err) {
      console.error(`[agent-runtime] cycle error for ${agentId}:`, err);
    }
  }, CYCLE_INTERVAL_MS);

  activeLoops.set(agentId, interval);

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
  if (strategies.length === 0) return;

  const walletAddress = (agent.walletAddress || getWalletAddress()) as `0x${string}`;
  const activeStrategies = strategies.filter(s => s.status === 'active');
  if (activeStrategies.length === 0) return;

  // Load portfolio and market snapshot once for the entire cycle
  const market = await getMarketSnapshot(activeStrategies);

  const tokenSet = new Set<string>();
  for (const s of activeStrategies) {
    tokenSet.add(s.tokenIn.toLowerCase());
    tokenSet.add(s.tokenOut.toLowerCase());
  }
  const tokens = [...tokenSet];

  const rawBalances = await getTokenBalances(walletAddress, tokens);
  const usdcValues = new Map<string, bigint>();
  for (const [token, balance] of rawBalances.entries()) {
    const price = getPriceFromSnapshot(market, token);
    if (price) {
      usdcValues.set(token, computeUsdcValue(balance, price));
    } else {
      usdcValues.set(token, BigInt(0));
    }
  }

  const portfolio = await getPortfolioSnapshot(walletAddress, tokens, usdcValues);

  for (const strategy of activeStrategies) {
    try {
      await processStrategy(agentId, strategy, portfolio, market);
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
  portfolio: Awaited<ReturnType<typeof getPortfolioSnapshot>>,
  market: Awaited<ReturnType<typeof getMarketSnapshot>>,
): Promise<void> {
  // Deduplicate: skip if a pending/approved proposal already exists for this strategy
  const existing = await getRecentProposal(
    agentId,
    strategy.id,
    INTERVAL_MS[strategy.interval] ?? CYCLE_INTERVAL_MS,
  );
  if (existing) return;

  // Get last execution time for interval checking
  const lastExecTime = await getLastExecutionForStrategy(strategy.id);

  // Evaluate strategy
  const action = evaluateStrategy(strategy, portfolio, market, lastExecTime);
  if (!action) return;

  // Update lastTriggeredAt for cooldown tracking
  await db.agentStrategy.update({
    where: { id: strategy.id },
    data: { lastTriggeredAt: new Date() },
  });

  // All proposals go to pending — World Wallet requires user confirmation
  await createProposal({
    agentId,
    strategyId: strategy.id,
    type: action.type,
    tokenIn: action.tokenIn,
    tokenOut: action.tokenOut,
    amount: action.amount,
    estimatedOutput: action.estimatedOutput,
    reasoning: action.reasoning,
    status: 'pending',
    triggerType: action.triggerType,
    triggerSummary: action.triggerSummary,
    notionalUsd: action.notionalUsd,
    expectedSlippageBps: action.expectedSlippageBps,
    marketSnapshot: action.marketSnapshot,
  });
}

export function _resetForTesting(): void {}

export { CYCLE_INTERVAL_MS };
