// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const { mockIsInstalled, mockVerify } = vi.hoisted(() => ({
  mockIsInstalled: vi.fn(() => false),
  mockVerify: vi.fn(),
}))

vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: {
    isInstalled: mockIsInstalled,
    commandsAsync: { verify: mockVerify },
    user: { walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18' },
  },
}))

vi.mock('@/lib/constants', () => ({
  WORLD_ID_ACTION: 'register-agent',
  TOKEN_MAP: {},
}))

import { VerifyButton } from '@/components/verify-button'

describe('VerifyButton', () => {
  beforeEach(() => {
    mockIsInstalled.mockReset()
    mockVerify.mockReset()
    mockIsInstalled.mockReturnValue(false)
    vi.stubGlobal('fetch', vi.fn())
  })

  it('renders "Verify with World ID" initially', () => {
    render(<VerifyButton onVerified={vi.fn()} />)
    expect(screen.getByRole('button').textContent).toBe('Verify with World ID')
  })

  it('shows an error when World App is not available', async () => {
    mockIsInstalled.mockReturnValue(false)
    render(<VerifyButton onVerified={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toContain('World App')
  })

  it('shows an error when verification is cancelled', async () => {
    mockIsInstalled.mockReturnValue(true)
    mockVerify.mockResolvedValue({ finalPayload: { status: 'error' } })
    render(<VerifyButton onVerified={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toContain('cancelled')
  })

  it('calls the backend and marks the user verified on success', async () => {
    const onVerified = vi.fn()
    mockIsInstalled.mockReturnValue(true)
    mockVerify.mockResolvedValue({
      finalPayload: {
        status: 'success',
        merkle_root: '',
        nullifier_hash: '',
        proof: '',
        verification_level: 'orb',
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        verified: true,
        userId: 'user-1',
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
      }),
    }))

    render(<VerifyButton onVerified={onVerified} />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalledWith(
        'user-1',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18'
      )
    })
    expect(screen.getByRole('button').textContent).toBe('Verified Human')
  })

  it('shows backend rejection errors', async () => {
    mockIsInstalled.mockReturnValue(true)
    mockVerify.mockResolvedValue({
      finalPayload: {
        status: 'success',
        merkle_root: '',
        nullifier_hash: '',
        proof: '',
        verification_level: 'orb',
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'World ID verification failed' }),
    }))

    render(<VerifyButton onVerified={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toContain('World ID verification failed')
  })
})
