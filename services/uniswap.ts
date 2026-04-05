import { BaseError, ContractFunctionRevertedError, encodeFunctionData } from 'viem';
import type { SwapRequest, SwapResult, QuoteResult } from '@/types';
import { getWalletClient, getPublicClient } from './wallet';

const API_BASE = 'https://trade-api.gateway.uniswap.org';
const WORLD_USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';
const PROXY_APPROVAL_HEADER = 'x-permit2-enabled';
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

const permit2Abi = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
] as const;

export interface PreparedTransaction {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: `0x${string}`;
}

export interface PreparedSwapPlan {
  transactions: PreparedTransaction[];
  amountIn: string;
  amountOut: string;
  approvalNeeded: boolean;
}

function getApiKey(): string {
  const key = process.env.UNISWAP_API_KEY;
  if (!key) throw new Error('UNISWAP_API_KEY is not set');
  return key;
}

function apiHeaders(options: { permit2Enabled?: boolean } = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': getApiKey(),
    'x-universal-router-version': '2.0',
  };

  if (options.permit2Enabled === false) {
    headers[PROXY_APPROVAL_HEADER] = 'false';
  }

  return headers;
}

function resolveSwapperAddress(swapper?: string): `0x${string}` {
  if (swapper) {
    if (!isValidAddress(swapper)) {
      throw new Error(`Invalid swapper address: ${swapper}`);
    }
    return swapper as `0x${string}`;
  }

  return getWalletClient().account.address;
}

function normalizePreparedTransaction(value: unknown): PreparedTransaction | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as {
    to?: unknown;
    data?: unknown;
    value?: unknown;
  };

  if (typeof candidate.to !== 'string' || !isValidAddress(candidate.to)) {
    return null;
  }
  if (typeof candidate.data !== 'string' || !candidate.data.startsWith('0x') || candidate.data.length <= 2) {
    return null;
  }

  if (candidate.value !== undefined && typeof candidate.value !== 'string') {
    return null;
  }

  let normalizedValue: `0x${string}` | undefined;
  if (typeof candidate.value === 'string') {
    try {
      const rawValue = candidate.value.trim();
      const parsedValue = rawValue === '' ? BigInt(0) : BigInt(rawValue);
      if (parsedValue > BigInt(0)) {
        normalizedValue = `0x${parsedValue.toString(16)}`;
      }
    } catch {
      return null;
    }
  }

  return {
    to: candidate.to as `0x${string}`,
    data: candidate.data as `0x${string}`,
    ...(normalizedValue ? { value: normalizedValue } : {}),
  };
}

export async function getCurrentPermit2Allowance(
  token: string,
  owner: string,
  spender: string,
): Promise<bigint> {
  try {
    const allowance = await getPublicClient().readContract({
      address: PERMIT2_ADDRESS,
      abi: permit2Abi,
      functionName: 'allowance',
      args: [owner as `0x${string}`, token as `0x${string}`, spender as `0x${string}`],
    });
    if (Array.isArray(allowance)) {
      return BigInt(allowance[0] ?? 0);
    }
    return BigInt(0);
  } catch {
    return BigInt(0);
  }
}

function buildPermit2ApprovalTransaction(
  token: string,
  spender: string,
  amount: string,
): PreparedTransaction {
  return {
    to: PERMIT2_ADDRESS,
    data: encodeFunctionData({
      abi: permit2Abi,
      functionName: 'approve',
      args: [
        token as `0x${string}`,
        spender as `0x${string}`,
        BigInt(amount),
        0,
      ],
    }),
  };
}

function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function validateSwapRequest(req: SwapRequest): void {
  if (!isValidAddress(req.tokenIn)) throw new Error(`Invalid tokenIn address: ${req.tokenIn}`);
  if (!isValidAddress(req.tokenOut)) throw new Error(`Invalid tokenOut address: ${req.tokenOut}`);
  if (req.tokenIn.toLowerCase() === req.tokenOut.toLowerCase()) {
    throw new Error('tokenIn and tokenOut must differ');
  }
  if (!req.amount || BigInt(req.amount) <= BigInt(0)) throw new Error(`Invalid amount: ${req.amount}`);
  if (req.chainId !== 480) throw new Error(`Unsupported chainId: ${req.chainId}. Only World Chain (480) is supported`);
}

function tokenDecimals(address?: string | null): number {
  if (!address) return 18;

  switch (address.toLowerCase()) {
    case WORLD_USDC.toLowerCase():
      return 6;
    case '0x03c7054bcb39f7b2e5b2c7acb37583e32d70cfa':
      return 8;
    default:
      return 18;
  }
}

function decimalToRawAmount(value: string, decimals: number): string {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');
  const whole = BigInt(wholePart || '0');
  const paddedFraction = (fractionPart + '0'.repeat(decimals)).slice(0, decimals);
  const fraction = BigInt(paddedFraction || '0');

  return (whole * BigInt(10) ** BigInt(decimals) + fraction).toString();
}

export function resolveQuoteAmountOut(
  quote: QuoteResult['quote'] | undefined,
  tokenOut?: string | null,
): string {
  const outputAmount = quote?.output?.amount?.trim();
  if (outputAmount && /^\d+$/.test(outputAmount)) {
    return outputAmount;
  }

  const rawQuote = quote?.quote?.trim();
  if (rawQuote && /^\d+$/.test(rawQuote)) {
    return rawQuote;
  }

  const decimalQuote = quote?.quoteDecimals?.trim();
  if (decimalQuote) {
    return decimalToRawAmount(decimalQuote, tokenDecimals(tokenOut));
  }

  return '0';
}

export async function getQuote(
  req: SwapRequest,
  options: { swapper?: string; permit2Enabled?: boolean } = {},
): Promise<QuoteResult> {
  validateSwapRequest(req);

  const swapper = resolveSwapperAddress(options.swapper);
  const res = await fetch(`${API_BASE}/v1/quote`, {
    method: 'POST',
    headers: apiHeaders({ permit2Enabled: options.permit2Enabled }),
    body: JSON.stringify({
      type: 'EXACT_INPUT',
      amount: req.amount,
      tokenIn: req.tokenIn,
      tokenOut: req.tokenOut,
      tokenInChainId: req.chainId,
      tokenOutChainId: req.chainId,
      swapper,
      slippageTolerance: req.slippage,
      autoSlippage: req.slippage ? undefined : 'DEFAULT',
      routingPreference: 'BEST_PRICE',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Uniswap quote failed (${res.status}): ${body}`);
  }

  const data = await res.json();

  if (data.txFailureReason) {
    return {
      quote: data.quote,
      permitData: data.permitData ?? undefined,
      gasEstimate: data.quote?.gasUseEstimate,
      txFailureReason: data.txFailureReason,
    };
  }

  return {
    quote: data.quote,
    permitData: data.permitData ?? undefined,
    gasEstimate: data.quote?.gasUseEstimate,
  };
}

export async function prepareUserSwap(req: SwapRequest, walletAddress: string): Promise<PreparedSwapPlan> {
  validateSwapRequest(req);
  const swapper = resolveSwapperAddress(walletAddress);
  const quoteResult = await getQuote(req, { swapper });

  if (quoteResult.txFailureReason) {
    throw new Error(quoteResult.txFailureReason);
  }

  const swapRes = await fetch(`${API_BASE}/v1/swap`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ quote: quoteResult.quote }),
  });

  if (!swapRes.ok) {
    const body = await swapRes.text();
    throw new Error(`Uniswap swap preparation failed (${swapRes.status}): ${body}`);
  }

  const { swap } = await swapRes.json();
  const swapTx = normalizePreparedTransaction(swap);
  if (!swapTx) {
    throw new Error('Uniswap swap response missing transaction calldata');
  }

  return {
    transactions: [
      buildPermit2ApprovalTransaction(req.tokenIn, swapTx.to, req.amount),
      swapTx,
    ],
    amountIn: req.amount,
    amountOut: resolveQuoteAmountOut(quoteResult.quote, req.tokenOut),
    approvalNeeded: true,
  };
}

function describeRevertError(error: unknown): string | null {
  if (!(error instanceof BaseError)) {
    if (error instanceof Error) return error.message;
    return null;
  }

  const reverted = error.walk(
    (candidate) => candidate instanceof ContractFunctionRevertedError,
  ) as ContractFunctionRevertedError | null;

  if (reverted?.reason) return reverted.reason;
  if (reverted?.shortMessage) return reverted.shortMessage;
  if (error.shortMessage) return error.shortMessage;
  if (error.details) return error.details;

  return error.message;
}

async function getRevertReason(args: {
  publicClient: ReturnType<typeof getPublicClient>;
  account: `0x${string}`;
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
  gas?: bigint | undefined;
  blockNumber?: bigint | undefined;
}): Promise<string | null> {
  try {
    await args.publicClient.call({
      account: args.account,
      to: args.to,
      data: args.data,
      value: args.value,
      gas: args.gas,
      blockNumber: args.blockNumber,
    });
    return null;
  } catch (error) {
    return describeRevertError(error);
  }
}

export async function executeSwap(req: SwapRequest): Promise<SwapResult> {
  try {
    validateSwapRequest(req);
    const walletClient = getWalletClient();
    const publicClient = getPublicClient();

    // 1. Quote
    const quoteResult = await getQuote(req);
    if (quoteResult.txFailureReason) {
      return { success: false, amountIn: req.amount, amountOut: '0', error: quoteResult.txFailureReason };
    }

    // 2. Permit2 signature (both or neither — never partial)
    let signature: string | undefined;
    if (quoteResult.permitData) {
      signature = await walletClient.signTypedData({
        domain: quoteResult.permitData.domain,
        types: quoteResult.permitData.types,
        primaryType: 'PermitSingle',
        message: quoteResult.permitData.values,
      });
    }

    // 3. Swap calldata
    const swapBody: Record<string, unknown> = { quote: quoteResult.quote };
    if (signature && quoteResult.permitData) {
      swapBody.signature = signature;
      swapBody.permitData = quoteResult.permitData;
    }

    const swapRes = await fetch(`${API_BASE}/v1/swap`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(swapBody),
    });

    if (!swapRes.ok) {
      const body = await swapRes.text();
      throw new Error(`Uniswap swap failed (${swapRes.status}): ${body}`);
    }

    const { swap } = await swapRes.json();

    // 4. Validate tx data before broadcast
    if (!swap?.data || swap.data === '0x' || swap.data === '') {
      throw new Error('Uniswap returned empty swap calldata');
    }
    if (!swap.to || !swap.from) {
      throw new Error('Uniswap swap response missing to/from addresses');
    }

    // 5. Broadcast
    const txHash = await walletClient.sendTransaction({
      to: swap.to as `0x${string}`,
      data: swap.data as `0x${string}`,
      value: BigInt(swap.value ?? '0'),
      gas: swap.gasLimit ? BigInt(swap.gasLimit) : undefined,
    });

    // 6. Confirm
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const confirmedTxHash = receipt.transactionHash ?? txHash;
    const confirmedTx = await publicClient.getTransaction({ hash: confirmedTxHash });
    const swapValue = BigInt(swap.value ?? '0');
    const swapGas = swap.gasLimit ? BigInt(swap.gasLimit) : undefined;

    if (Number(confirmedTx.chainId) !== req.chainId) {
      throw new Error(`Confirmed tx mined on unexpected chainId: ${confirmedTx.chainId}`);
    }
    if (!confirmedTx.blockNumber) {
      throw new Error('Confirmed tx is missing a block number');
    }
    if (!confirmedTx.to || confirmedTx.to.toLowerCase() !== String(swap.to).toLowerCase()) {
      throw new Error('Confirmed tx target did not match Uniswap swap target');
    }
    if (confirmedTx.from.toLowerCase() !== walletClient.account.address.toLowerCase()) {
      throw new Error('Confirmed tx sender did not match the execution wallet');
    }

    if (receipt.status !== 'success') {
      const revertReason = await getRevertReason({
        publicClient,
        account: walletClient.account.address,
        to: swap.to as `0x${string}`,
        data: swap.data as `0x${string}`,
        value: swapValue,
        gas: swapGas,
        blockNumber: receipt.blockNumber,
      });

      return {
        success: false,
        txHash: confirmedTxHash,
        amountIn: req.amount,
        amountOut: resolveQuoteAmountOut(quoteResult.quote, req.tokenOut),
        gasUsed: receipt.gasUsed.toString(),
        error: revertReason ?? 'Transaction reverted',
      };
    }

    return {
      success: true,
      txHash: confirmedTxHash,
      amountIn: req.amount,
      amountOut: resolveQuoteAmountOut(quoteResult.quote, req.tokenOut),
      gasUsed: receipt.gasUsed.toString(),
    };
  } catch (err) {
    return {
      success: false,
      amountIn: req.amount,
      amountOut: '0',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export { WORLD_USDC, API_BASE, isValidAddress, validateSwapRequest };
