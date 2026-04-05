import type {
  AgentStrategy,
  EvaluatorAction,
  JsonValue,
  PortfolioSnapshot,
  MarketSnapshotData,
} from '@/types';
import { getPriceFromSnapshot, computeUsdcValue } from './market-snapshot';
import { getTokenDecimals } from './portfolio';
import { WORLD_USDC } from '@/lib/constants';

const INTERVAL_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Evaluates whether a DCA strategy should produce a proposal this cycle.
 *
 * Returns an EvaluatorAction if conditions are met, null otherwise.
 * Conditions: interval is due, amount exceeds minNotionalUsd, outside cooldown.
 */
export function evaluateDcaStrategy(
  strategy: AgentStrategy,
  portfolio: PortfolioSnapshot,
  market: MarketSnapshotData,
  lastExecutionTime: Date | null,
): EvaluatorAction | null {
  // Check interval timing
  if (!isIntervalDue(strategy, lastExecutionTime)) return null;

  // Check cooldown
  if (isInCooldown(strategy)) return null;

  // Compute notional
  const tokenInPrice = getPriceFromSnapshot(market, strategy.tokenIn);
  let notionalUsd = '0';
  if (tokenInPrice) {
    const amountBigInt = BigInt(strategy.amountPerInterval);
    notionalUsd = computeUsdcValue(amountBigInt, tokenInPrice).toString();
  }

  // Check min notional
  if (strategy.minNotionalUsd && BigInt(notionalUsd) < BigInt(strategy.minNotionalUsd)) {
    return null;
  }

  // Estimate output from market snapshot
  const tokenOutPrice = getPriceFromSnapshot(market, strategy.tokenOut);
  let estimatedOutput = '0';
  if (tokenInPrice && tokenOutPrice && BigInt(tokenOutPrice.usdcPerUnit) > BigInt(0)) {
    const amountBigInt = BigInt(strategy.amountPerInterval);
    const usdcValue = computeUsdcValue(amountBigInt, tokenInPrice);
    const outDecimals = getTokenDecimals(strategy.tokenOut);
    const oneOutUnit = BigInt(10) ** BigInt(outDecimals);
    estimatedOutput = ((usdcValue * oneOutUnit) / BigInt(tokenOutPrice.usdcPerUnit)).toString();
  }

  return {
    type: 'dca_buy',
    tokenIn: strategy.tokenIn,
    tokenOut: strategy.tokenOut,
    amount: strategy.amountPerInterval,
    estimatedOutput,
    notionalUsd,
    triggerType: 'interval_due',
    triggerSummary: `${strategy.interval} DCA interval reached`,
    reasoning: `DCA: ${strategy.name} — ${strategy.interval} buy of ${formatHumanAmount(strategy.amountPerInterval, strategy.tokenIn)} ${tokenSymbolOrAddress(strategy.tokenIn)}`,
    marketSnapshot: buildMarketSnapshotPayload(strategy, portfolio, market),
  };
}

/**
 * Evaluates whether a rebalance strategy should produce a proposal this cycle.
 *
 * Returns an EvaluatorAction if drift exceeds the band, null otherwise.
 * Requires both token balances known and targetAllocationBps + rebalanceBandBps set.
 */
export function evaluateRebalanceStrategy(
  strategy: AgentStrategy,
  portfolio: PortfolioSnapshot,
  market: MarketSnapshotData,
): EvaluatorAction | null {
  if (strategy.targetAllocationBps == null || strategy.rebalanceBandBps == null) {
    return null;
  }

  // Check cooldown
  if (isInCooldown(strategy)) return null;

  const tokenOutLower = strategy.tokenOut.toLowerCase();
  const tokenInLower = strategy.tokenIn.toLowerCase();

  // Get current allocation for tokenOut (the target asset)
  const currentAllocationBps = portfolio.allocations[tokenOutLower];
  if (currentAllocationBps == null) return null;

  // Also need tokenIn allocation to exist
  if (portfolio.allocations[tokenInLower] == null) return null;

  const targetBps = strategy.targetAllocationBps;
  const bandBps = strategy.rebalanceBandBps;
  const driftBps = currentAllocationBps - targetBps;
  const absDriftBps = Math.abs(driftBps);

  // Drift must exceed band
  if (absDriftBps <= bandBps) return null;

  // Determine trade direction and size
  // If tokenOut is overweight (driftBps > 0), we need to sell tokenOut for tokenIn.
  // If tokenOut is underweight (driftBps < 0), we need to sell tokenIn for tokenOut.
  const tokenOutPrice = getPriceFromSnapshot(market, strategy.tokenOut);
  const tokenInPrice = getPriceFromSnapshot(market, strategy.tokenIn);
  if (!tokenOutPrice || !tokenInPrice) return null;

  const totalUsdc = BigInt(portfolio.totalUsdcValue);
  if (totalUsdc === BigInt(0)) return null;

  // Amount to trade in USDC terms = (absDrift / 10000) * totalPortfolioValue
  const tradeUsdcNotional = (totalUsdc * BigInt(absDriftBps)) / BigInt(10000);

  // Check min notional
  if (strategy.minNotionalUsd && tradeUsdcNotional < BigInt(strategy.minNotionalUsd)) {
    return null;
  }

  let sellToken: string;
  let buyToken: string;
  let sellPrice: typeof tokenOutPrice;

  if (driftBps > 0) {
    // tokenOut is overweight — sell tokenOut, buy tokenIn
    sellToken = strategy.tokenOut;
    buyToken = strategy.tokenIn;
    sellPrice = tokenOutPrice;
  } else {
    // tokenOut is underweight — sell tokenIn, buy tokenOut
    sellToken = strategy.tokenIn;
    buyToken = strategy.tokenOut;
    sellPrice = tokenInPrice;
  }

  // Convert USDC notional to sell token amount
  const sellDecimals = getTokenDecimals(sellToken);
  const oneUnit = BigInt(10) ** BigInt(sellDecimals);
  const sellUsdcPerUnit = BigInt(sellPrice.usdcPerUnit);
  if (sellUsdcPerUnit === BigInt(0)) return null;

  const sellAmount = (tradeUsdcNotional * oneUnit) / sellUsdcPerUnit;
  if (sellAmount === BigInt(0)) return null;

  // Estimate output
  const buyPrice = getPriceFromSnapshot(market, buyToken);
  let estimatedOutput = '0';
  if (buyPrice && BigInt(buyPrice.usdcPerUnit) > BigInt(0)) {
    const buyDecimals = getTokenDecimals(buyToken);
    const oneBuyUnit = BigInt(10) ** BigInt(buyDecimals);
    estimatedOutput = ((tradeUsdcNotional * oneBuyUnit) / BigInt(buyPrice.usdcPerUnit)).toString();
  }

  const driftPercent = (absDriftBps / 100).toFixed(2);
  const targetPercent = (targetBps / 100).toFixed(2);
  const currentPercent = (currentAllocationBps / 100).toFixed(2);

  return {
    type: 'rebalance',
    tokenIn: sellToken,
    tokenOut: buyToken,
    amount: sellAmount.toString(),
    estimatedOutput,
    notionalUsd: tradeUsdcNotional.toString(),
    triggerType: 'rebalance_drift',
    triggerSummary: `Portfolio drift exceeded ${(bandBps / 100).toFixed(2)}% rebalance band`,
    reasoning: `${tokenSymbolOrAddress(strategy.tokenOut)} allocation is ${currentPercent}%, target is ${targetPercent}%, drift of ${driftPercent}%. Selling ${tokenSymbolOrAddress(sellToken)} for ${tokenSymbolOrAddress(buyToken)} to return toward target.`,
    marketSnapshot: buildMarketSnapshotPayload(strategy, portfolio, market),
  };
}

/**
 * Dispatches to the correct evaluator based on strategy type.
 */
export function evaluateStrategy(
  strategy: AgentStrategy,
  portfolio: PortfolioSnapshot,
  market: MarketSnapshotData,
  lastExecutionTime: Date | null,
): EvaluatorAction | null {
  switch (strategy.strategyType) {
    case 'rebalance':
      return evaluateRebalanceStrategy(strategy, portfolio, market);
    case 'dca':
    default:
      return evaluateDcaStrategy(strategy, portfolio, market, lastExecutionTime);
  }
}

// ── Helpers ──

function isIntervalDue(strategy: AgentStrategy, lastExecutionTime: Date | null): boolean {
  if (process.env.DEMO_MODE === 'true') return true;

  const intervalMs = INTERVAL_MS[strategy.interval];
  if (!intervalMs) return true;

  if (!lastExecutionTime) return true;

  return Date.now() - lastExecutionTime.getTime() >= intervalMs;
}

function isInCooldown(strategy: AgentStrategy): boolean {
  if (!strategy.cooldownMinutes || !strategy.lastTriggeredAt) return false;
  const cooldownMs = strategy.cooldownMinutes * 60 * 1000;
  const lastTriggered = new Date(strategy.lastTriggeredAt).getTime();
  return Date.now() - lastTriggered < cooldownMs;
}

function formatHumanAmount(rawAmount: string, tokenAddress: string): string {
  const decimals = getTokenDecimals(tokenAddress);
  const raw = BigInt(rawAmount);
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  if (remainder === BigInt(0)) return whole.toString();
  const frac = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${frac}`;
}

function tokenSymbolOrAddress(address: string): string {
  const known: Record<string, string> = {
    '0x79a02482a880bce3f13e09da970dc34db4cd24d1': 'USDC',
    '0x4200000000000000000000000000000000000006': 'WETH',
    '0x163f8c2467924be0ae7b5347228cabf260318753': 'WLD',
    '0x03c7054bcb39f7b2e5b2c7acb37583e32d70cfa': 'WBTC',
  };
  return known[address.toLowerCase()] ?? `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function buildMarketSnapshotPayload(
  strategy: AgentStrategy,
  portfolio: PortfolioSnapshot,
  market: MarketSnapshotData,
): { [key: string]: JsonValue } {
  const tokenInLower = strategy.tokenIn.toLowerCase();
  const tokenOutLower = strategy.tokenOut.toLowerCase();
  const tokenInBalance = portfolio.balances.find(b => b.token === tokenInLower);
  const tokenOutBalance = portfolio.balances.find(b => b.token === tokenOutLower);

  return {
    tokenInBalance: tokenInBalance?.balance ?? '0',
    tokenOutBalance: tokenOutBalance?.balance ?? '0',
    currentAllocationBps: portfolio.allocations[tokenOutLower] ?? 0,
    targetAllocationBps: strategy.targetAllocationBps,
    driftBps: strategy.targetAllocationBps != null
      ? (portfolio.allocations[tokenOutLower] ?? 0) - strategy.targetAllocationBps
      : null,
    quotedAt: market.fetchedAt,
  };
}

export { INTERVAL_MS };
