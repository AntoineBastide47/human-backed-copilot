import { describe, it, expect, vi } from 'vitest'

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      }),
  },
}))

vi.mock('@/lib/auth', () => ({
  clearSessionCookie: vi.fn(() => 'session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'),
}))

import { POST } from '@/app/api/logout/route'

describe('POST /api/logout', () => {
  it('returns success and clears the session cookie', async () => {
    const res = await POST()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})
