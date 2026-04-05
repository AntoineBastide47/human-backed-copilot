import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'

export async function POST(): Promise<NextResponse<{ success: boolean }>> {
  return NextResponse.json(
    { success: true },
    { headers: { 'Set-Cookie': clearSessionCookie() } },
  )
}
