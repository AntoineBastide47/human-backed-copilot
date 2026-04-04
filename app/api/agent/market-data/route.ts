import { NextResponse } from 'next/server';
import { verifyAgentkitRequest } from '@/services/agentkit';
import { getQuote } from '@/services/uniswap';

export async function GET(request: Request) {
  const auth = await verifyAgentkitRequest(request);
  if (!auth.granted) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const url = new URL(request.url);
  const tokenIn = url.searchParams.get('tokenIn');
  const tokenOut = url.searchParams.get('tokenOut');
  const chainId = url.searchParams.get('chainId');
  const amount = url.searchParams.get('amount');

  if (!tokenIn || !tokenOut || !chainId || !amount) {
    return NextResponse.json(
      { error: 'Missing required query params: tokenIn, tokenOut, chainId, amount' },
      { status: 400 },
    );
  }

  const parsedChainId = parseInt(chainId, 10);
  if (isNaN(parsedChainId)) {
    return NextResponse.json({ error: 'chainId must be a number' }, { status: 400 });
  }

  try {
    const quote = await getQuote({
      tokenIn,
      tokenOut,
      chainId: parsedChainId,
      amount,
    });

    return NextResponse.json({
      tokenIn,
      tokenOut,
      chainId: parsedChainId,
      amountIn: amount,
      estimatedOutput: quote.quote?.quote ?? quote.quote?.quoteDecimals ?? null,
      gasEstimate: quote.gasEstimate ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
