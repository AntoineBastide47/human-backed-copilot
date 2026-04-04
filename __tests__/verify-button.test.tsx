// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// All module mocks must be declared before any imports that consume them.
// Vitest hoists vi.mock() calls to the top of the file automatically.

vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: {
    isInstalled: vi.fn(() => false),
    commandsAsync: { verify: vi.fn() },
  },
  VerificationLevel: { Orb: 'orb' },
}))

vi.mock('@/lib/constants', () => ({
  WORLD_ID_ACTION: 'register-agent',
}))

// Single top-level mock; USE_MOCK is controlled via a mutable object to avoid
// re-mocking between tests (which doesn't work reliably with module caching).
// IMPORTANT: vi.mock factory cannot reference variables declared outside it
// (hoisting issue) — inline all values.
const mockConfig = { USE_MOCK: true }
vi.mock('@/lib/mock-data', () => ({
  get USE_MOCK() { return mockConfig.USE_MOCK },
  MOCK_VERIFY: {
    userId: 'mock-user-1',
    verified: true,
    walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
  },
}))

const MOCK_VERIFY_DATA = {
  userId: 'mock-user-1',
  verified: true,
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
}

import { VerifyButton } from '@/components/verify-button'
import { MiniKit } from '@worldcoin/minikit-js'

type VerifyCommandResult = Awaited<ReturnType<typeof MiniKit.commandsAsync.verify>>

describe('VerifyButton — mock mode (USE_MOCK=true)', () => {
  beforeEach(() => {
    mockConfig.USE_MOCK = true
    vi.resetAllMocks()
  })

  it('renders "Verify with World ID" initially', () => {
    render(<VerifyButton onVerified={vi.fn()} />)
    expect(screen.getByRole('button').textContent).toBe('Verify with World ID')
  })

  it('is not disabled initially', () => {
    render(<VerifyButton onVerified={vi.fn()} />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('calls onVerified with userId and walletAddress in mock mode', async () => {
    const onVerified = vi.fn()
    render(<VerifyButton onVerified={onVerified} />)

    fireEvent.click(screen.getByRole('button'))
    await waitFor(
      () => expect(onVerified).toHaveBeenCalledWith(
        MOCK_VERIFY_DATA.userId,
        MOCK_VERIFY_DATA.walletAddress,
      ),
      { timeout: 2000 }
    )
  })

  it('shows "Verified Human" button after successful verify', async () => {
    render(<VerifyButton onVerified={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(
      () => expect(screen.getByRole('button').textContent).toBe('Verified Human'),
      { timeout: 2000 }
    )
  })
})

describe('VerifyButton — live mode (USE_MOCK=false)', () => {
  beforeEach(() => {
    mockConfig.USE_MOCK = false
    vi.resetAllMocks()
  })

  it('shows error when MiniKit is not installed', async () => {
    vi.mocked(MiniKit.isInstalled).mockReturnValue(false)
    render(<VerifyButton onVerified={vi.fn()} />)

    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toContain('World App')
  })

  it('shows error on cancelled verification', async () => {
    vi.mocked(MiniKit.isInstalled).mockReturnValue(true)
    vi.mocked(MiniKit.commandsAsync.verify).mockResolvedValue({
      finalPayload: { status: 'error' },
    } as VerifyCommandResult)

    render(<VerifyButton onVerified={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toContain('cancelled')
  })

  it('shows error when backend returns verified=false', async () => {
    vi.mocked(MiniKit.isInstalled).mockReturnValue(true)
    vi.mocked(MiniKit.commandsAsync.verify).mockResolvedValue({
      finalPayload: { status: 'success', merkle_root: '', nullifier_hash: '', proof: '', verification_level: 'orb' },
    } as VerifyCommandResult)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ verified: false }),
    }))

    render(<VerifyButton onVerified={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 2000 })
    expect(screen.getByRole('alert').textContent).toContain('rejected')
  })

  it('shows error when fetch fails with non-ok status', async () => {
    vi.mocked(MiniKit.isInstalled).mockReturnValue(true)
    vi.mocked(MiniKit.commandsAsync.verify).mockResolvedValue({
      finalPayload: { status: 'success', merkle_root: '', nullifier_hash: '', proof: '', verification_level: 'orb' },
    } as VerifyCommandResult)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    }))

    render(<VerifyButton onVerified={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 2000 })
    expect(screen.getByRole('alert').textContent).toContain('Server error')
  })
})
