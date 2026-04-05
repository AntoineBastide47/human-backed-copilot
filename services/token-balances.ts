import { erc20Abi, isAddress } from 'viem';
import { getPublicClient } from './wallet';

export async function getTokenBalances(
  walletAddress: string,
  tokenAddresses: string[],
): Promise<Record<string, string>> {
  if (!isAddress(walletAddress)) {
    throw new Error(`Invalid wallet address: ${walletAddress}`);
  }

  const client = getPublicClient();
  const uniqueTokens = [...new Set(tokenAddresses.map((token) => token.toLowerCase()))]
    .filter((token) => isAddress(token));

  const balanceEntries = await Promise.all(
    uniqueTokens.map(async (token) => {
      try {
        const balance = await client.readContract({
          address: token as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [walletAddress as `0x${string}`],
        });

        return [token, balance.toString()] as const;
      } catch {
        return [token, '0'] as const;
      }
    }),
  );

  return Object.fromEntries(balanceEntries);
}
