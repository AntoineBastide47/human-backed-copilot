import { db } from './db';
import type {
  AgentStrategy,
  Proposal,
  Execution,
  CreateProposalInput,
  SaveExecutionInput,
  StrategyType,
} from '@/types';
import { normalizeSpendLimits } from './spend-limits';

// ── Prisma row shapes (mirrors schema.prisma) ────────────────────────────────

interface DbStrategy {
  id: string; agentId: string; name: string; tokenIn: string; tokenOut: string;
  chainId: number; amountPerInterval: string; interval: string; autoExecute: boolean;
  status: string; strategyType: string; targetAllocationBps: number | null;
  rebalanceBandBps: number | null; maxSlippageBps: number | null;
  minNotionalUsd: string | null; cooldownMinutes: number | null;
  lastTriggeredAt: Date | null; metadata: unknown; createdAt: Date;
}
interface DbProposal {
  id: string; agentId: string; strategyId: string; type: string;
  tokenIn: string; tokenOut: string; amount: string; estimatedOutput: string;
  reasoning: string; status: string; triggerType: string | null;
  triggerSummary: string | null; notionalUsd: string | null;
  expectedSlippageBps: number | null; marketSnapshot: unknown; createdAt: Date;
}
interface DbExecution {
  id: string; agentId: string; strategyId: string; proposalId: string | null;
  txHash: string; amountIn: string; amountOut: string; status: string; executedAt: Date;
}
interface DbAgent {
  id: string; ownerId: string; walletAddress: string; agentbookRegId: string | null;
  ensName: string | null; status: string; usageCount: number; freeTrialRemaining: number;
  spendLimits: unknown; createdAt: Date;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

export function toStrategyResponse(r: DbStrategy): AgentStrategy {
  return {
    id: r.id,
    agentId: r.agentId,
    name: r.name,
    tokenIn: r.tokenIn,
    tokenOut: r.tokenOut,
    chainId: r.chainId,
    amountPerInterval: r.amountPerInterval,
    interval: r.interval as AgentStrategy['interval'],
    autoExecute: r.autoExecute,
    status: r.status as AgentStrategy['status'],
    strategyType: (r.strategyType ?? 'dca') as StrategyType,
    targetAllocationBps: r.targetAllocationBps,
    rebalanceBandBps: r.rebalanceBandBps,
    maxSlippageBps: r.maxSlippageBps,
    minNotionalUsd: r.minNotionalUsd,
    cooldownMinutes: r.cooldownMinutes,
    lastTriggeredAt: r.lastTriggeredAt?.toISOString() ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.createdAt.toISOString(),
  };
}

export function toProposalResponse(r: DbProposal): Proposal {
  return {
    id: r.id,
    agentId: r.agentId,
    strategyId: r.strategyId,
    type: r.type as Proposal['type'],
    tokenIn: r.tokenIn,
    tokenOut: r.tokenOut,
    amount: r.amount,
    estimatedOutput: r.estimatedOutput,
    reasoning: r.reasoning,
    status: r.status as Proposal['status'],
    triggerType: r.triggerType,
    triggerSummary: r.triggerSummary,
    notionalUsd: r.notionalUsd,
    expectedSlippageBps: r.expectedSlippageBps,
    marketSnapshot: (r.marketSnapshot as Record<string, unknown>) ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toExecutionResponse(r: DbExecution): Execution {
  return {
    id: r.id,
    agentId: r.agentId,
    strategyId: r.strategyId,
    proposalId: r.proposalId ?? '',
    txHash: r.txHash,
    amountIn: r.amountIn,
    amountOut: r.amountOut,
    status: r.status as Execution['status'],
    executedAt: r.executedAt.toISOString(),
  };
}

export function toAgentResponse(r: DbAgent) {
  const limits = normalizeSpendLimits(
    (r.spendLimits as { maxPerTx?: string; dailyCap?: string } | null) ?? {},
  );
  return {
    id: r.id,
    ownerId: r.ownerId,
    walletAddress: r.walletAddress,
    ensName: r.ensName,
    status: r.status as 'registering' | 'active' | 'paused',
    usageCount: r.usageCount,
    freeTrialRemaining: r.freeTrialRemaining,
    spendLimits: {
      maxPerTx: limits.maxPerTx,
      dailyCap: limits.dailyCap,
    },
    createdAt: r.createdAt.toISOString(),
  };
}

// ── Contract C functions — imported by P0 agent-runtime ──────────────────────

export async function getAgentStrategies(agentId: string): Promise<AgentStrategy[]> {
  const rows = await db.agentStrategy.findMany({
    where: { agentId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toStrategyResponse);
}

export async function createProposal(data: CreateProposalInput): Promise<Proposal> {
  const row = await db.proposal.create({ data });
  return toProposalResponse(row);
}

export async function getApprovedProposals(agentId: string): Promise<Proposal[]> {
  const rows = await db.proposal.findMany({
    where: { agentId, status: 'approved' },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toProposalResponse);
}

export async function markProposalExecuted(
  proposalId: string,
  data: SaveExecutionInput
): Promise<void> {
  await db.$transaction([
    db.proposal.update({ where: { id: proposalId }, data: { status: 'executed' } }),
    db.execution.create({ data: { ...data, proposalId } }),
  ]);
}

export async function saveExecution(data: SaveExecutionInput): Promise<Execution> {
  const row = await db.execution.create({ data });
  return toExecutionResponse(row);
}

/**
 * Returns the executedAt timestamp of the most recent execution for a strategy.
 * Used by P0 agent-runtime to enforce interval scheduling (hourly/daily/weekly).
 */
export async function getLastExecutionForStrategy(strategyId: string): Promise<Date | null> {
  const row = await db.execution.findFirst({
    where: { strategyId },
    orderBy: { executedAt: 'desc' },
    select: { executedAt: true },
  });
  return row?.executedAt ?? null;
}

/**
 * Updates a proposal's status in place.
 * Used by P0 agent-runtime to roll back auto-execute failures to 'pending'.
 */
export async function updateProposalStatus(proposalId: string, status: string): Promise<void> {
  await db.proposal.update({ where: { id: proposalId }, data: { status } });
}

/**
 * Returns the most recent non-rejected/executed proposal for this strategy
 * within the given time window. Used by P0 to deduplicate proposal creation.
 */
export async function getRecentProposal(
  agentId: string,
  strategyId: string,
  windowMs: number
): Promise<Proposal | null> {
  const since = new Date(Date.now() - windowMs);
  const row = await db.proposal.findFirst({
    where: {
      agentId,
      strategyId,
      // 'rejected' is included: a human rejection must be respected for the
      // full interval window before the agent re-proposes the same action.
      status: { in: ['pending', 'approved', 'rejected'] },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
  });
  return row ? toProposalResponse(row) : null;
}
