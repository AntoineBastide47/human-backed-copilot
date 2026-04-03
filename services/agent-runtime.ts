import { getQuote, executeSwap } from './uniswap';
import {
  getAgentStrategies,
  createProposal,
  getApprovedProposals,
  markProposalExecuted,
} from '@/lib/agent-service';
import type { AgentStrategy } from '@/types';

const CYCLE_INTERVAL_MS = 60_000;

const activeLoops = new Map<string, NodeJS.Timeout>();

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
    if (!shouldExecuteNow(strategy)) continue;

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

    await markProposalExecuted(proposal.id, {
      agentId,
      strategyId: strategy.id,
      proposalId: proposal.id,
      txHash: result.txHash ?? '',
      amountIn: result.amountIn,
      amountOut: result.amountOut,
      status: result.success ? 'confirmed' : 'failed',
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
    try {
      const result = await executeSwap({
        tokenIn: proposal.tokenIn,
        tokenOut: proposal.tokenOut,
        chainId: 480,
        amount: proposal.amount,
      });

      await markProposalExecuted(proposal.id, {
        agentId,
        strategyId: proposal.strategyId,
        proposalId: proposal.id,
        txHash: result.txHash ?? '',
        amountIn: result.amountIn,
        amountOut: result.amountOut,
        status: result.success ? 'confirmed' : 'failed',
      });
    } catch (err) {
      console.error(
        `[agent-runtime] failed executing proposal ${proposal.id}:`,
        err,
      );
    }
  }
}

function shouldExecuteNow(_strategy: AgentStrategy): boolean {
  // For demo: always fire. Production: check last execution timestamp vs interval.
  return true;
}

export { CYCLE_INTERVAL_MS };
