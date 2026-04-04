import { getQuote, executeSwap } from './uniswap';
import {
  getAgentStrategies,
  createProposal,
  getApprovedProposals,
  markProposalExecuted,
  getRecentProposal,
} from '@/lib/agent-service';
import { db } from '@/lib/db';
import type { AgentStrategy } from '@/types';

const CYCLE_INTERVAL_MS = 60_000;
const MAX_PROPOSAL_RETRIES = 3;

const INTERVAL_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

const activeLoops = new Map<string, NodeJS.Timeout>();
const proposalRetries = new Map<string, number>();
const executingProposals = new Set<string>();

export function isLoopActive(agentId: string): boolean {
  return activeLoops.has(agentId);
}

export async function startAgentLoop(agentId: string): Promise<void> {
  if (activeLoops.has(agentId)) return;

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
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { status: true },
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
      await processStrategy(agentId, strategy);
    } catch (err) {
      console.error(
        `[agent-runtime] strategy ${strategy.id} failed:`,
        err,
      );
    }
  }

  await executeApprovedProposals(agentId);
}

async function processStrategy(
  agentId: string,
  strategy: AgentStrategy,
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
  });

  const estimatedOutput =
    quote.quote?.quoteDecimals ?? quote.quote?.quote ?? '0';

  if (strategy.autoExecute) {
    const proposal = await createProposal({
      agentId,
      strategyId: strategy.id,
      type: 'dca_buy',
      tokenIn: strategy.tokenIn,
      tokenOut: strategy.tokenOut,
      amount: strategy.amountPerInterval,
      estimatedOutput,
      reasoning: `Auto-DCA: ${strategy.name}`,
      status: 'approved',
    });

    const result = await executeSwap({
      tokenIn: strategy.tokenIn,
      tokenOut: strategy.tokenOut,
      chainId: strategy.chainId,
      amount: strategy.amountPerInterval,
    });

    if (!result.success) {
      await updateProposalStatus(proposal.id, 'pending');
      console.warn(
        `[agent-runtime] auto-execute failed for proposal ${proposal.id}, reverted to pending`,
      );
      return;
    }

    await markProposalExecuted(proposal.id, {
      agentId,
      strategyId: strategy.id,
      proposalId: proposal.id,
      txHash: result.txHash ?? '',
      amountIn: result.amountIn,
      amountOut: result.amountOut,
      status: 'confirmed',
    });
  } else {
    await createProposal({
      agentId,
      strategyId: strategy.id,
      type: 'dca_buy',
      tokenIn: strategy.tokenIn,
      tokenOut: strategy.tokenOut,
      amount: strategy.amountPerInterval,
      estimatedOutput,
      reasoning: `DCA: ${strategy.name} — awaiting approval`,
      status: 'pending',
    });
  }
}

async function executeApprovedProposals(agentId: string): Promise<void> {
  const approved = await getApprovedProposals(agentId);

  for (const proposal of approved) {
    // Concurrent execution guard: skip if already being executed by another cycle
    if (executingProposals.has(proposal.id)) continue;

    const retries = proposalRetries.get(proposal.id) ?? 0;
    if (retries >= MAX_PROPOSAL_RETRIES) {
      console.warn(
        `[agent-runtime] skipping proposal ${proposal.id}: ${MAX_PROPOSAL_RETRIES} retries exhausted`,
      );
      continue;
    }

    executingProposals.add(proposal.id);
    try {
      const result = await executeSwap({
        tokenIn: proposal.tokenIn,
        tokenOut: proposal.tokenOut,
        chainId: 480,
        amount: proposal.amount,
      });

      if (!result.success) {
        proposalRetries.set(proposal.id, retries + 1);
        console.warn(
          `[agent-runtime] proposal ${proposal.id} execution failed (attempt ${retries + 1}/${MAX_PROPOSAL_RETRIES}): ${result.error}`,
        );
        continue;
      }

      await markProposalExecuted(proposal.id, {
        agentId,
        strategyId: proposal.strategyId,
        proposalId: proposal.id,
        txHash: result.txHash ?? '',
        amountIn: result.amountIn,
        amountOut: result.amountOut,
        status: 'confirmed',
      });

      proposalRetries.delete(proposal.id);
    } catch (err) {
      proposalRetries.set(proposal.id, retries + 1);
      console.error(
        `[agent-runtime] failed executing proposal ${proposal.id} (attempt ${retries + 1}/${MAX_PROPOSAL_RETRIES}):`,
        err,
      );
    } finally {
      executingProposals.delete(proposal.id);
    }
  }
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

// TODO: Request P1 to move to lib/agent-service.ts
async function updateProposalStatus(
  proposalId: string,
  status: string,
): Promise<void> {
  await db.proposal.update({ where: { id: proposalId }, data: { status } });
}

export function _resetForTesting(): void {
  proposalRetries.clear();
  executingProposals.clear();
}

export { CYCLE_INTERVAL_MS, MAX_PROPOSAL_RETRIES, proposalRetries, executingProposals };
