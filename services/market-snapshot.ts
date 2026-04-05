import { getQuote, resolveQuoteAmountOut } from './uniswap';
import { getTokenDecimals } from './portfolio';
import { WORLD_USDC } from '@/lib/constants';
import type { MarketSnapshotData, TokenPrice, AgentStrategy } from '@/types';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  price: TokenPrice;
  expiresAt: number;
}

const priceCache = new Map<string, CacheEntry>();

function cacheKey(token: string): string {
  return token.toLowerCase();
}

/**
 * Fetches the USDC price for a single token by quoting 1 unit through Uniswap.
 * Results are cached for 60 seconds.
 */
export async function getTokenUsdcPrice(
  token: string,
  chainId: number,
  swapper?: string,
): Promise<TokenPrice> {
  const key = cacheKey(token);
  const usdcLower = WORLD_USDC.toLowerCase();

  // USDC→USDC is always 1:1
  if (key === usdcLower) {
    return {
      token: key,
      usdcPerUnit: '1000000', // 1 USDC in 6-decimal raw
      referenceAmount: '1000000',
      referenceOutput: '1000000',
    };
  }

  const cached = priceCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.price;
  }

  const decimals = getTokenDecimals(token);
  const oneUnit = BigInt(10) ** BigInt(decimals);

  const opts = swapper ? { swapper } : {};
  const quoteResult = await getQuote({
    tokenIn: token,
    tokenOut: WORLD_USDC,
    chainId,
    amount: oneUnit.toString(),
  }, opts);

  const output = resolveQuoteAmountOut(quoteResult.quote, WORLD_USDC);

  const price: TokenPrice = {
    token: key,
    usdcPerUnit: output,
    referenceAmount: oneUnit.toString(),
    referenceOutput: output,
  };

  priceCache.set(key, { price, expiresAt: Date.now() + CACHE_TTL_MS });
  return price;
}

/**
 * Given a token balance (raw units) and its USDC price, compute the USDC notional.
 */
export function computeUsdcValue(
  balance: bigint,
  price: TokenPrice,
): bigint {
  if (balance === BigInt(0)) return BigInt(0);
  const referenceAmount = BigInt(price.referenceAmount);
  if (referenceAmount === BigInt(0)) return BigInt(0);
  return (balance * BigInt(price.usdcPerUnit)) / referenceAmount;
}

/**
 * Builds a market snapshot for all unique tokens across the given strategies.
 * Fetches prices in parallel, uses cache for dedup.
 */
export async function getMarketSnapshot(
  strategies: AgentStrategy[],
  swapper?: string,
): Promise<MarketSnapshotData> {
  const tokenSet = new Set<string>();
  for (const s of strategies) {
    tokenSet.add(s.tokenIn.toLowerCase());
    tokenSet.add(s.tokenOut.toLowerCase());
  }

  const chainId = strategies[0]?.chainId ?? 480;
  const tokens = [...tokenSet];

  const prices = await Promise.all(
    tokens.map(token => getTokenUsdcPrice(token, chainId, swapper)),
  );

  return {
    prices,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Lookup a price from a market snapshot by token address.
 */
export function getPriceFromSnapshot(
  snapshot: MarketSnapshotData,
  token: string,
): TokenPrice | undefined {
  return snapshot.prices.find(p => p.token === token.toLowerCase());
}

export function _clearCacheForTesting(): void {
  priceCache.clear();
}

export { CACHE_TTL_MS };
