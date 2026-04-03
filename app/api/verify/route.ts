import { NextResponse } from 'next/server';

// P1 owns this route
export async function POST() {
  // TODO: verifyCloudProof + upsert user + sign session
  return NextResponse.json(
    { userId: 'stub-user-id', verified: true, walletAddress: '0x0' },
    { status: 200 }
  );
}
