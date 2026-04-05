import type {
  Agent,
  AgentStrategy,
  Execution,
  Proposal,
  VerifyResponse,
} from '@/types'

// P2 owns this file
// Toggle to false when P1's real routes are live
// Search for USE_MOCK before Sync #5 to ensure all mocks are OFF
export const USE_MOCK = false;

export const MOCK_AGENT: Agent = {
  id: 'mock-agent-1',
  ownerId: 'mock-user-1',
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
  ensName: 'demo-dca.provix.eth',
  status: 'active' as const,
  usageCount: 1,
  freeTrialRemaining: 2,
  spendLimits: { maxPerTx: '1000000000', dailyCap: '5000000000' },
  createdAt: new Date().toISOString(),
};

export const MOCK_STRATEGIES: AgentStrategy[] = [
  {
    id: 'mock-strat-1', agentId: 'mock-agent-1', name: 'Daily ETH→USDC DCA',
    tokenIn: '0x4200000000000000000000000000000000000006',
    tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
    chainId: 480, amountPerInterval: '500000000000000000', interval: 'daily' as const,
    autoExecute: false, status: 'active' as const,
    strategyType: 'dca' as const, targetAllocationBps: null, rebalanceBandBps: null,
    maxSlippageBps: null, minNotionalUsd: null, cooldownMinutes: null, lastTriggeredAt: null,
    metadata: {}, createdAt: new Date().toISOString(),
  },
];

export const MOCK_PROPOSALS: Proposal[] = [
  {
    id: 'mock-prop-1', agentId: 'mock-agent-1', strategyId: 'mock-strat-1',
    type: 'dca_buy' as const,
    tokenIn: '0x4200000000000000000000000000000000000006',
    tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
    amount: '500000000000000000', estimatedOutput: '925000000',
    reasoning: 'DCA #4 of daily WETH→USDC plan',
    status: 'pending' as const,
    triggerType: null, triggerSummary: null, notionalUsd: null,
    expectedSlippageBps: null, marketSnapshot: null,
    createdAt: new Date().toISOString(),
  },
];

export const MOCK_EXECUTIONS: Execution[] = [
  {
    id: 'mock-exec-1', agentId: 'mock-agent-1', strategyId: 'mock-strat-1',
    proposalId: 'mock-prop-0', txHash: '0xabc123def456789abcdef',
    amountIn: '500000000000000000', amountOut: '912000000',
    status: 'confirmed' as const, executedAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

// Verify mock response — matches VerifyResponse from types/index.ts
export const MOCK_VERIFY: VerifyResponse = {
  userId: 'mock-user-1',
  verified: true,
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
};

/**
 * Typed fetch wrapper. Throws with a clean message on non-ok responses,
 * never leaking raw server errors to the UI.
 *
 * Usage: const data = await apiFetch<Agent>('/api/agents/123')
 */
export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch((): unknown => ({}));
    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : `Request failed: ${res.status}`;
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ── Token utilities (P2-owned, UI layer only) ─────────────────────────────────

/**
 * Extended token info for all pairs supported by the strategy form.
 * Addresses are canonical World Chain (chain 480).
 */
export const EXTENDED_TOKEN_INFO: Record<string, { symbol: string; decimals: number; color: string }> = {
  '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1': { symbol: 'USDC', decimals: 6,  color: '#16a34a' },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18, color: '#3b82f6' },
  '0x163f8C2467924be0ae7B5347228CABF260318753': { symbol: 'WLD',  decimals: 18, color: '#6366f1' },
  '0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa': { symbol: 'WBTC', decimals: 8,  color: '#f59e0b' },
};

/** Returns the decimal precision for a token address (defaults to 18). */
export function tokenDecimals(address: string): number {
  return EXTENDED_TOKEN_INFO[address]?.decimals ?? 18;
}

/** Returns the ticker symbol for a token address. */
export function tokenSymbol(address: string): string {
  return EXTENDED_TOKEN_INFO[address]?.symbol ?? address.slice(0, 6) + '…';
}

/**
 * Converts a human-readable amount (e.g. "0.5") to the raw integer string
 * expected by the contract (e.g. "500000000000000000" for WETH).
 * Uses Math.round to avoid floating-point truncation.
 */
export function toTokenAmount(humanAmount: string, address: string): string {
  const decimals = tokenDecimals(address);
  return BigInt(Math.round(parseFloat(humanAmount) * 10 ** decimals)).toString();
}

/**
 * Converts a raw integer token amount back to a human-readable string.
 * Low-decimal tokens (USDC, WBTC) → 2 d.p.; 18-decimal tokens → 4 d.p.
 */
export function fromTokenAmount(rawAmount: string, address: string): string {
  const decimals = tokenDecimals(address);
  const value = Number(BigInt(rawAmount)) / 10 ** decimals;
  return value.toFixed(decimals <= 8 ? 2 : 4);
}
