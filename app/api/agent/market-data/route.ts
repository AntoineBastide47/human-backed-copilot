import { NextResponse } from 'next/server';

// P0 owns this route — x402 protected
export async function GET() {
  return NextResponse.json({ message: 'x402 endpoint — not yet wired' }, { status: 501 });
}
