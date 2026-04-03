import { NextResponse } from 'next/server';

// STUB: returns mock data. Replace with real DB logic in H7.5-12.
export async function POST(
  _req: Request,
  _ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ success: boolean }>> {
  return NextResponse.json({ success: true });
}
