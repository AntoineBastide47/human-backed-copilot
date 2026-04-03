import type { ISuccessResult } from '@worldcoin/minikit-js';

// ═══════════════════════════════════════════════════════════════════════════
// Shared types — P1 is the SOLE editor of this file.
// P0 and P2: request additions in the group chat, do not edit directly.
// ═══════════════════════════════════════════════════════════════════════════

// ── Auth ──
export interface VerifyRequest {
  payload: ISuccessResult;
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
export interface QuoteResult {
  quote: any;
  permitData?: any;
  gasEstimate?: string;
  txFailureReason?: string;
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
