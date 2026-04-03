import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ success: true, txHash: '0xstub' });
}
