import { NextResponse } from 'next/server';

// P1 owns this route
export async function POST() {
  return NextResponse.json({ id: 'stub', status: 'registering' }, { status: 201 });
}

export async function GET() {
  return NextResponse.json([]);
}
