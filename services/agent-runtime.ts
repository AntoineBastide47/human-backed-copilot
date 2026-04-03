import { getQuote, executeSwap } from './uniswap';
import {
  getAgentStrategies,
  createProposal,
  getApprovedProposals,
  markProposalExecuted,
} from '@/lib/agent-service';
// TODO: Move getLastExecutionForStrategy and updateProposalStatus to lib/agent-service.ts (request from P1)
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

export function isLoopActive(agentId: string): boolean {
  return activeLoops.has(agentId);
}

export async function startAgentLoop(agentId: string): Promise<void> {
  if (activeLoops.has(agentId)) return;

  await runCycle(agentId);

  const interval = setInterval(async () => {
    try {
      await runCycle(agentId);
    } catch (err) {
      console.error(`[agent-runtime] cycle error for ${agentId}:`, err);
    }
  }, CYCLE_INTERVAL_MS);

  activeLoops.set(agentId, interval);
}

export async function stopAgentLoop(agentId: string): Promise<void> {
  const interval = activeLoops.get(agentId);
  if (interval) {
    clearInterval(interval);
    activeLoops.delete(agentId);
  }
}

async function runCycle(agentId: string): Promise<void> {
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
    const retries = proposalRetries.get(proposal.id) ?? 0;
    if (retries >= MAX_PROPOSAL_RETRIES) {
      console.warn(
        `[agent-runtime] skipping proposal ${proposal.id}: ${MAX_PROPOSAL_RETRIES} retries exhausted`,
      );
      continue;
    }

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

// TODO: Move to lib/agent-service.ts — P1 should own DB queries
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

// TODO: Move to lib/agent-service.ts — P1 should own DB queries
async function updateProposalStatus(
  proposalId: string,
  status: string,
): Promise<void> {
  await db.proposal.update({ where: { id: proposalId }, data: { status } });
}

export function _resetForTesting(): void {
  proposalRetries.clear();
}

export { CYCLE_INTERVAL_MS, MAX_PROPOSAL_RETRIES, proposalRetries };
