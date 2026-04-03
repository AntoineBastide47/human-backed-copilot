// P2 owns this file
// Toggle to false when P1's real routes are live
// Search for USE_MOCK before Sync #5 to ensure all mocks are OFF
export const USE_MOCK = true;

export const MOCK_AGENT = {
  id: 'mock-agent-1',
  ownerId: 'mock-user-1',
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
  ensName: 'demo-dca.copilot.eth',
  status: 'active' as const,
  usageCount: 1,
  freeTrialRemaining: 2,
  spendLimits: { maxPerTx: '1000000', dailyCap: '5000000' },
  createdAt: new Date().toISOString(),
};

export const MOCK_STRATEGIES = [
  {
    id: 'mock-strat-1', agentId: 'mock-agent-1', name: 'Daily ETH→USDC DCA',
    tokenIn: '0x4200000000000000000000000000000000000006',
    tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
    chainId: 480, amountPerInterval: '500000000000000000', interval: 'daily' as const,
    autoExecute: false, status: 'active' as const, createdAt: new Date().toISOString(),
  },
];

export const MOCK_PROPOSALS = [
  {
    id: 'mock-prop-1', agentId: 'mock-agent-1', strategyId: 'mock-strat-1',
    type: 'dca_buy' as const,
    tokenIn: '0x4200000000000000000000000000000000000006',
    tokenOut: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
    amount: '500000000000000000', estimatedOutput: '925000000',
    reasoning: 'DCA #4 of daily WETH→USDC plan',
    status: 'pending' as const, createdAt: new Date().toISOString(),
  },
];

export const MOCK_EXECUTIONS = [
  {
    id: 'mock-exec-1', agentId: 'mock-agent-1', strategyId: 'mock-strat-1',
    proposalId: 'mock-prop-0', txHash: '0xabc123def456789abcdef',
    amountIn: '500000000000000000', amountOut: '912000000',
    status: 'confirmed' as const, executedAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

// Verify mock response — matches VerifyResponse from types/index.ts
export const MOCK_VERIFY = {
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
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}
