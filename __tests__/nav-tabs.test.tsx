// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type React from 'react'
import { NavTabs } from '@/components/nav-tabs'

type LinkProps = {
  href: string
  children: React.ReactNode
  className?: string
}

type ProposalStub = { id: string }

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className }: LinkProps) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

const mockSetAgentId = vi.fn()
vi.mock('@/components/use-agent-id', () => ({
  useAgentId: () => ({
    agentId: 'agent-123',
    hydrated: true,
    isResolving: false,
    setAgentId: mockSetAgentId,
  }),
}))

const swrData: { data: ProposalStub[] } = {
  data: [{ id: 'p1' }, { id: 'p2' }],
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
  swrData.data = [{ id: 'p1' }, { id: 'p2' }]
  mockSetAgentId.mockReset()
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
    swrData.data = []
    render(<NavTabs />)
    expect(screen.queryByTestId('pending-badge')).toBeNull()
  })

  it('caps badge at "9+" for counts over 9', () => {
    swrData.data = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}` }))
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
