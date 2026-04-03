import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ id: 'stub', status: 'active' }, { status: 201 });
}
