/**
 * Demo seed fixtures — typed constants used by prisma/seed.ts.
 * Extracted here so they can be imported and validated in unit tests
 * without needing a live Prisma client.
 */

// ── World Chain canonical token addresses ──────────────────────────────────
export const WETH = '0x4200000000000000000000000000000000000006';
export const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';
export const WLD  = '0x163f8C2467924be0ae7B5347228CABF260318753';
export const WBTC = '0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa';

export const CHAIN_ID = 480;

// ── Demo user ──────────────────────────────────────────────────────────────
export const DEMO_USER = {
  nullifierHash: '0xdeadbeef00000000000000000000000000000000000000000000000000000001',
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
  verificationLevel: 'orb' as const,
  isVerified: true,
};

// ── Demo agent ──────────────────────────────────────────────────────────────
export const DEMO_AGENT = {
  walletAddress: DEMO_USER.walletAddress,
  agentbookRegId: 'reg_demo_copilot_001',
  ensName: 'demo-dca.copilot.eth',
  status: 'active' as const,
  usageCount: 8,
  freeTrialRemaining: 2,
  spendLimits: {
    maxPerTx:  '1000000000', // $1,000 USDC
    dailyCap:  '5000000000', // $5,000 USDC
  },
};

// ── Demo strategies ──────────────────────────────────────────────────────────
export const DEMO_STRATEGIES = [
  {
    name: 'Daily ETH → USDC',
    tokenIn: WETH, tokenOut: USDC,
    chainId: CHAIN_ID,
    amountPerInterval: '50000000000000000', // 0.05 WETH
    interval: 'daily' as const,
    autoExecute: false,
    status: 'active' as const,
  },
  {
    name: 'Daily USDC → ETH (auto)',
    tokenIn: USDC, tokenOut: WETH,
    chainId: CHAIN_ID,
    amountPerInterval: '100000000', // 100 USDC
    interval: 'daily' as const,
    autoExecute: true,
    status: 'active' as const,
  },
  {
    name: 'Weekly WLD → USDC',
    tokenIn: WLD, tokenOut: USDC,
    chainId: CHAIN_ID,
    amountPerInterval: '50000000000000000000', // 50 WLD
    interval: 'weekly' as const,
    autoExecute: false,
    status: 'active' as const,
  },
] as const;

// ── Historical execution records (index matches strategy index above) ────────
// Each entry becomes one proposal (status='executed') + one execution.
export const DEMO_EXECUTIONS = [
  // Strategy 0: Daily ETH → USDC — 4 days of history
  { strategyIdx: 0, amountIn: '50000000000000000', amountOut: '93500000',           daysBack: 1,  txSeed: 0xa001 },
  { strategyIdx: 0, amountIn: '50000000000000000', amountOut: '92100000',           daysBack: 3,  txSeed: 0xa002 },
  { strategyIdx: 0, amountIn: '50000000000000000', amountOut: '91800000',           daysBack: 7,  txSeed: 0xa003 },
  { strategyIdx: 0, amountIn: '50000000000000000', amountOut: '90200000',           daysBack: 11, txSeed: 0xa004 },
  // Strategy 1: Daily USDC → ETH auto — 3 days
  { strategyIdx: 1, amountIn: '100000000',         amountOut: '53400000000000000',  daysBack: 2,  txSeed: 0xb001 },
  { strategyIdx: 1, amountIn: '100000000',         amountOut: '52800000000000000',  daysBack: 5,  txSeed: 0xb002 },
  { strategyIdx: 1, amountIn: '100000000',         amountOut: '54100000000000000',  daysBack: 9,  txSeed: 0xb003 },
  // Strategy 2: Weekly WLD → USDC — 1 week back
  { strategyIdx: 2, amountIn: '50000000000000000000', amountOut: '72000000',        daysBack: 8,  txSeed: 0xc001 },
] as const;

// ── Pending proposals ready for the demo ────────────────────────────────────
// strategyIdx 0 = Daily ETH→USDC, strategyIdx 2 = Weekly WLD→USDC
export const DEMO_PROPOSALS = [
  {
    strategyIdx: 0,
    type: 'dca_buy' as const,
    tokenIn: WETH, tokenOut: USDC,
    amount: '50000000000000000',
    estimatedOutput: '94200000',
    reasoning: 'Daily DCA: ETH above 30-day MA. Selling 0.05 WETH → ~$94.20 USDC.',
  },
  {
    strategyIdx: 2,
    type: 'dca_buy' as const,
    tokenIn: WLD, tokenOut: USDC,
    amount: '50000000000000000000',
    estimatedOutput: '73500000',
    reasoning: 'Weekly WLD DCA: WLD/USDC at weekly support. Converting 50 WLD → ~$73.50 USDC.',
  },
] as const;

/** Deterministic hex tx hash from a numeric seed. */
export function makeTxHash(seed: number): string {
  return '0x' + seed.toString(16).padStart(8, '0') + 'a1b2c3d4e5f6'.repeat(4).slice(0, 56);
}

/** Returns a Date n days before now. */
export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}
