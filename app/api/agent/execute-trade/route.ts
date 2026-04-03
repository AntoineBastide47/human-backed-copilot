import { NextResponse } from 'next/server';
import { verifyAgentkitRequest } from '@/services/agentkit';
import { executeSwap } from '@/services/uniswap';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 5_000;

export async function POST(request: Request) {
  const auth = await verifyAgentkitRequest(request);
  if (!auth.granted) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tokenIn, tokenOut, chainId, amount, slippage } = body as {
    tokenIn?: string;
    tokenOut?: string;
    chainId?: number;
    amount?: string;
    slippage?: string;
  };

  if (!tokenIn || !tokenOut || !chainId || !amount) {
    return NextResponse.json(
      { error: 'Missing required fields: tokenIn, tokenOut, chainId, amount' },
      { status: 400 },
    );
  }

  let lastError: string | undefined;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await executeSwap({ tokenIn, tokenOut, chainId, amount, slippage });
    if (result.success) {
      return NextResponse.json(result);
    }
    lastError = result.error;
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt)));
    }
  }

  return NextResponse.json(
    { success: false, error: `Swap failed after ${MAX_RETRIES} attempts: ${lastError}` },
    { status: 502 },
  );
}
