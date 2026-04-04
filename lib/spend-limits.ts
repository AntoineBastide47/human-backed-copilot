import { WORLD_USDC } from './constants';

export const DEFAULT_SPEND_LIMITS = {
  maxPerTx: '1000000000',
  dailyCap: '5000000000',
} as const;

const LEGACY_DEFAULT_SPEND_LIMITS = {
  maxPerTx: '1000000',
  dailyCap: '5000000',
} as const;

const USDC_SCALE = BigInt(1_000_000);

type SpendLimits = {
  maxPerTx?: string;
  dailyCap?: string;
} | null | undefined;

type ProposalLike = {
  tokenIn: string;
  tokenOut: string;
  amount: string;
  estimatedOutput: string;
};

export function normalizeSpendLimits(limits: SpendLimits): {
  maxPerTx: string;
  dailyCap: string;
} {
  const maxPerTx = limits?.maxPerTx ?? '0';
  const dailyCap = limits?.dailyCap ?? '0';

  if (
    maxPerTx === LEGACY_DEFAULT_SPEND_LIMITS.maxPerTx &&
    dailyCap === LEGACY_DEFAULT_SPEND_LIMITS.dailyCap
  ) {
    return { ...DEFAULT_SPEND_LIMITS };
  }

  return { maxPerTx, dailyCap };
}

export function getProposalUsdcNotional(proposal: ProposalLike): bigint {
  const usdcAddress = WORLD_USDC.toLowerCase();

  if (proposal.tokenIn.toLowerCase() === usdcAddress) {
    return parseUsdcAmount(proposal.amount);
  }

  if (proposal.tokenOut.toLowerCase() === usdcAddress) {
    return parseUsdcAmount(proposal.estimatedOutput);
  }

  throw new Error('Unsupported spend-limit pair');
}

export function formatUsdcAmount(amount: bigint | string): string {
  const value = typeof amount === 'string' ? BigInt(amount) : amount;
  const whole = value / USDC_SCALE;
  const fraction = (value % USDC_SCALE).toString().padStart(6, '0');
  const cents = fraction.slice(0, 2);

  if (cents === '00') {
    return `$${whole.toString()}`;
  }

  return `$${whole.toString()}.${cents}`;
}

function parseUsdcAmount(amount: string): bigint {
  if (/^\d+$/.test(amount)) {
    return BigInt(amount);
  }

  const normalized = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Invalid USDC amount');
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');
  const whole = BigInt(wholePart || '0');
  const paddedFraction = (fractionPart + '0'.repeat(6)).slice(0, 6);
  const fraction = BigInt(paddedFraction || '0');

  return whole * USDC_SCALE + fraction;
}
