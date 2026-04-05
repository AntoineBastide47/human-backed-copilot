import { BaseError, ContractFunctionRevertedError } from 'viem';
import type { SwapRequest, SwapResult, QuoteResult } from '@/types';
import { getWalletClient, getPublicClient } from './wallet';

const API_BASE = 'https://trade-api.gateway.uniswap.org';
const WORLD_USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';

function getApiKey(): string {
  const key = process.env.UNISWAP_API_KEY;
  if (!key) throw new Error('UNISWAP_API_KEY is not set');
  return key;
}

function apiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': getApiKey(),
    'x-universal-router-version': '2.0',
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

export async function getQuote(req: SwapRequest): Promise<QuoteResult> {
  validateSwapRequest(req);

  const walletClient = getWalletClient();
  const res = await fetch(`${API_BASE}/v1/quote`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      type: 'EXACT_INPUT',
      amount: req.amount,
      tokenIn: req.tokenIn,
      tokenOut: req.tokenOut,
      tokenInChainId: req.chainId,
      tokenOutChainId: req.chainId,
      swapper: walletClient.account.address,
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
