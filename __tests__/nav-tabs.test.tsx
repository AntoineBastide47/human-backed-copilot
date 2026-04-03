// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { NavTabs } from '@/components/nav-tabs'

type LinkProps = {
  href: string
  children: ReactNode
  className?: string
}

type ProposalStub = {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'executed'
}

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className }: LinkProps) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

vi.mock('@/lib/mock-data', () => ({
  USE_MOCK: true,
  MOCK_PROPOSALS: [
    { id: 'p1', status: 'pending' },
    { id: 'p2', status: 'pending' },
    { id: 'p3', status: 'executed' },
  ],
  apiFetch: vi.fn(),
}))

// Mutable SWR data — control per test via swrData
const swrData = {
  data: [
    { id: 'p1', status: 'pending' },
    { id: 'p2', status: 'pending' },
    { id: 'p3', status: 'executed' },
  ] as ProposalStub[],
}
vi.mock('swr', () => ({
  default: () => ({
    data: swrData.data,
    error: undefined,
    mutate: vi.fn(),
  }),
}))

import { usePathname } from 'next/navigation'

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue('/')
  // Reset to 2 pending
  swrData.data = [
    { id: 'p1', status: 'pending' },
    { id: 'p2', status: 'pending' },
    { id: 'p3', status: 'executed' },
  ]
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: vi.fn(),
  })
})

describe('NavTabs', () => {
  it('renders 4 tabs', () => {
    render(<NavTabs />)
    expect(screen.getByText('Home')).toBeTruthy()
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Proposals')).toBeTruthy()
    expect(screen.getByText('History')).toBeTruthy()
  })

  it('shows pending badge with correct count', () => {
    render(<NavTabs />)
    const badge = screen.getByTestId('pending-badge')
    expect(badge.textContent).toBe('2')
  })

  it('hides pending badge when count is 0', () => {
    swrData.data = [{ id: 'p1', status: 'executed' }]
    render(<NavTabs />)
    expect(screen.queryByTestId('pending-badge')).toBeNull()
  })

  it('caps badge at "9+" for counts over 9', () => {
    swrData.data = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, status: 'pending' }))
    render(<NavTabs />)
    const badge = screen.getByTestId('pending-badge')
    expect(badge.textContent).toBe('9+')
  })

  it('marks Home as active when path is /', () => {
    vi.mocked(usePathname).mockReturnValue('/')
    render(<NavTabs />)
    const homeLink = screen.getByText('Home').closest('a')
    expect(homeLink?.className).toContain('text-black')
  })

  it('marks Dashboard as active when path starts with /dashboard', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard')
    render(<NavTabs />)
    const dashLink = screen.getByText('Dashboard').closest('a')
    expect(dashLink?.className).toContain('text-black')
  })

  it('marks Home as inactive when on /dashboard', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard')
    render(<NavTabs />)
    const homeLink = screen.getByText('Home').closest('a')
    expect(homeLink?.className).toContain('text-stone-400')
  })

  it('has correct hrefs', () => {
    render(<NavTabs />)
    expect(screen.getByText('Home').closest('a')?.getAttribute('href')).toBe('/')
    expect(screen.getByText('Dashboard').closest('a')?.getAttribute('href')).toBe('/dashboard')
    expect(screen.getByText('Proposals').closest('a')?.getAttribute('href')).toBe('/agent/proposals')
    expect(screen.getByText('History').closest('a')?.getAttribute('href')).toBe('/agent/history')
  })
})
