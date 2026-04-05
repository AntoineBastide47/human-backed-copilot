// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

const mockReplace = vi.fn()
const mockPathname = vi.fn(() => '/dashboard')
const mockClearLocalStorageValue = vi.fn()
const mockFetch = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  usePathname: () => mockPathname(),
}))

vi.mock('@/lib/client-storage', () => ({
  clearLocalStorageValue: mockClearLocalStorageValue,
}))

describe('AuthExpiryHandler', () => {
  beforeEach(() => {
    mockReplace.mockReset()
    mockPathname.mockReset()
    mockPathname.mockReturnValue('/dashboard')
    mockClearLocalStorageValue.mockReset()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
  })

  it('clears stored session state and redirects home when auth expires off the home page', async () => {
    const { AuthExpiryHandler } = await import('@/components/auth-expiry-handler')

    render(<AuthExpiryHandler />)
    window.dispatchEvent(new CustomEvent('hbc-auth-expired'))

    expect(mockFetch).toHaveBeenCalledWith('/api/logout', {
      method: 'POST',
      keepalive: true,
    })
    expect(mockClearLocalStorageValue).toHaveBeenCalledWith('hbc_agentId')
    expect(mockClearLocalStorageValue).toHaveBeenCalledWith('hbc_userId')
    expect(mockClearLocalStorageValue).toHaveBeenCalledWith('hbc_walletAddress')
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('clears stored session state without redirecting when already on home', async () => {
    mockPathname.mockReturnValue('/')
    const { AuthExpiryHandler } = await import('@/components/auth-expiry-handler')

    render(<AuthExpiryHandler />)
    window.dispatchEvent(new CustomEvent('hbc-auth-expired'))

    expect(mockFetch).toHaveBeenCalledWith('/api/logout', {
      method: 'POST',
      keepalive: true,
    })
    expect(mockClearLocalStorageValue).toHaveBeenCalledTimes(3)
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
