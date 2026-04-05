import { getPublicClient } from './wallet';
import { WORLD_USDC } from '@/lib/constants';
import type { PortfolioSnapshot, TokenBalance } from '@/types';

const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const TOKEN_DECIMALS: Record<string, number> = {
  '0x79a02482a880bce3f13e09da970dc34db4cd24d1': 6,  // USDC
  '0x4200000000000000000000000000000000000006': 18, // WETH
  '0x163f8c2467924be0ae7b5347228cabf260318753': 18, // WLD
  '0x03c7054bcb39f7b2e5b2c7acb37583e32d70cfa': 8,  // WBTC
};

export function getTokenDecimals(token: string): number {
  return TOKEN_DECIMALS[token.toLowerCase()] ?? 18;
}

/**
 * Reads ERC-20 balances for a list of tokens via a single multicall.
 * Returns raw bigint balances keyed by lowercase token address.
 */
export async function getTokenBalances(
  walletAddress: `0x${string}`,
  tokens: string[],
): Promise<Map<string, bigint>> {
  if (tokens.length === 0) return new Map();

  const publicClient = getPublicClient();
  const uniqueTokens = [...new Set(tokens.map(t => t.toLowerCase()))];

  const balances = new Map<string, bigint>();
  await Promise.all(
    uniqueTokens.map(async (token) => {
      try {
        const balance = await publicClient.readContract({
          address: token as `0x${string}`,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [walletAddress],
        });
        balances.set(token, balance as bigint);
      } catch {
        balances.set(token, BigInt(0));
      }
    }),
  );
  return balances;
}

/**
 * Computes the allocation of each token in basis points (0–10000),
 * given balances and USDC-denominated values for each token.
 *
 * @param usdcValues - Map of lowercase token address to USDC notional value (raw 6-decimal units)
 */
export function computeAllocations(
  usdcValues: Map<string, bigint>,
): { allocations: Record<string, number>; totalUsdcValue: bigint } {
  let total = BigInt(0);
  for (const v of usdcValues.values()) {
    total += v;
  }

  const allocations: Record<string, number> = {};
  if (total === BigInt(0)) {
    for (const token of usdcValues.keys()) {
      allocations[token] = 0;
    }
    return { allocations, totalUsdcValue: total };
  }

  for (const [token, value] of usdcValues.entries()) {
    allocations[token] = Number((value * BigInt(10000)) / total);
  }

  return { allocations, totalUsdcValue: total };
}

/**
 * Builds a full portfolio snapshot for a wallet given a set of tokens.
 * Requires usdcValues (from market snapshot) to compute allocations.
 */
export async function getPortfolioSnapshot(
  walletAddress: `0x${string}`,
  tokens: string[],
  usdcValues: Map<string, bigint>,
): Promise<PortfolioSnapshot> {
  const rawBalances = await getTokenBalances(walletAddress, tokens);

  const balances: TokenBalance[] = [];
  for (const [token, balance] of rawBalances.entries()) {
    balances.push({
      token,
      balance: balance.toString(),
      decimals: getTokenDecimals(token),
    });
  }

  const { allocations, totalUsdcValue } = computeAllocations(usdcValues);

  return {
    walletAddress,
    balances,
    totalUsdcValue: totalUsdcValue.toString(),
    allocations,
    fetchedAt: new Date().toISOString(),
  };
}

export { WORLD_USDC, ERC20_BALANCE_ABI, TOKEN_DECIMALS };
