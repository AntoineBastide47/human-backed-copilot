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
  if (!req.amount || BigInt(req.amount) <= 0n) throw new Error(`Invalid amount: ${req.amount}`);
  if (req.chainId !== 480) throw new Error(`Unsupported chainId: ${req.chainId}. Only World Chain (480) is supported`);
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

    return {
      success: receipt.status === 'success',
      txHash,
      amountIn: req.amount,
      amountOut: quoteResult.quote?.quoteDecimals ?? quoteResult.quote?.quote ?? '0',
      gasUsed: receipt.gasUsed.toString(),
      error: receipt.status !== 'success' ? 'Transaction reverted' : undefined,
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
