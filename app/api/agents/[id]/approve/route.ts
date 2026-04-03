import { NextResponse } from 'next/server';

// STUB: returns mock data. Replace with real DB + swap logic in H7.5-12.
export async function POST(
  _req: Request,
  _ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ success: boolean; txHash: string }>> {
  return NextResponse.json({
    success: true,
    txHash: '0x' + 'a'.repeat(64),
  });
}
