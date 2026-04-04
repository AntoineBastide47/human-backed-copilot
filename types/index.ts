import type { TypedDataDomain, TypedDataParameter } from 'viem';

// ═══════════════════════════════════════════════════════════════════════════
// Shared types — P1 is the SOLE editor of this file.
// P0 and P2: request additions in the group chat, do not edit directly.
// ═══════════════════════════════════════════════════════════════════════════

// World ID proof payload (previously ISuccessResult from minikit-js v1)
export interface WorldIdProof {
  nullifier_hash: string;
  merkle_root: string;
  proof: string;
  verification_level?: string;
}

// ── Auth ──
export interface VerifyRequest {
  payload: WorldIdProof;
  action: string;
  signal?: string;
}
export interface VerifyResponse {
  userId: string;
  verified: boolean;
  walletAddress: string;
}

// ── Agent ──
export interface Agent {
  id: string;
  ownerId: string;
  walletAddress: string;
  ensName: string | null;
  status: 'registering' | 'active' | 'paused';
  usageCount: number;
  freeTrialRemaining: number;
  spendLimits: { maxPerTx: string; dailyCap: string };
  createdAt: string;
}

// ── Strategy ──
export interface AgentStrategy {
  id: string;
  agentId: string;
  name: string;
  tokenIn: string;
  tokenOut: string;
  chainId: number;
  amountPerInterval: string;
  interval: 'hourly' | 'daily' | 'weekly';
  autoExecute: boolean;
  status: 'active' | 'paused';
  createdAt: string;
}

// ── Proposal ──
export interface Proposal {
  id: string;
  agentId: string;
  strategyId: string;
  type: 'dca_buy' | 'rebalance';
  tokenIn: string;
  tokenOut: string;
  amount: string;
  estimatedOutput: string;
  reasoning: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  createdAt: string;
}

// ── Execution ──
export interface Execution {
  id: string;
  agentId: string;
  strategyId: string;
  proposalId: string;
  txHash: string;
  amountIn: string;
  amountOut: string;
  status: 'pending' | 'confirmed' | 'failed';
  executedAt: string;
}

// ── Pagination ──
export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
}

// ── Swap ──
export interface SwapRequest {
  tokenIn: string;
  tokenOut: string;
  chainId: number;
  amount: string;
  slippage?: string;
}
export interface SwapResult {
  success: boolean;
  txHash?: string;
  amountIn: string;
  amountOut: string;
  gasUsed?: string;
  error?: string;
}
export interface QuotePayload {
  quote?: string;
  quoteDecimals?: string;
  gasUseEstimate?: string;
  output?: { amount?: string };
}
export interface PermitData {
  domain: TypedDataDomain;
  types: Record<string, readonly TypedDataParameter[]>;
  values: Record<string, unknown>;
}
export interface QuoteResult {
  quote: QuotePayload;
  permitData?: PermitData;
  gasEstimate?: string;
  txFailureReason?: string;
}

// ── Request bodies ──
export interface WorldIdOnChainProof {
  merkle_root: string;
  nullifier_hash: string;
  proof: string; // ABI-encoded uint256[8]
}

export interface CreateAgentInput {
  walletAddress: string;
  spendLimits?: { maxPerTx: string; dailyCap: string };
  proof?: WorldIdOnChainProof;
  txHash?: string;
}
export interface CreateStrategyInput {
  name: string;
  tokenIn: string;
  tokenOut: string;
  chainId?: number;
  amountPerInterval: string;
  interval: 'hourly' | 'daily' | 'weekly';
  autoExecute?: boolean;
}

// ── Service layer inputs ──
export interface CreateProposalInput {
  agentId: string;
  strategyId: string;
  type: 'dca_buy' | 'rebalance';
  tokenIn: string;
  tokenOut: string;
  amount: string;
  estimatedOutput: string;
  reasoning: string;
  status: 'pending' | 'approved';
}
export interface SaveExecutionInput {
  agentId: string;
  strategyId: string;
  proposalId?: string;
  txHash: string;
  amountIn: string;
  amountOut: string;
  status: 'pending' | 'confirmed' | 'failed';
}
