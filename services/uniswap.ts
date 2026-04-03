// P0 owns this file
// TODO: getQuote() + executeSwap() against Uniswap Trading API
import type { SwapRequest, SwapResult, QuoteResult } from '@/types';

export async function getQuote(req: SwapRequest): Promise<QuoteResult> {
  throw new Error('Not implemented — P0 task H1-3');
}

export async function executeSwap(req: SwapRequest): Promise<SwapResult> {
  throw new Error('Not implemented — P0 task H1-3');
}
