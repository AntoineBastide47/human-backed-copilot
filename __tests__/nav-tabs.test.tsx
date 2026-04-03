// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NavTabs } from '@/components/nav-tabs'

// next/navigation must be mocked — not available in test env
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}))

// next/link renders a plain <a> in tests
vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

// mock mock-data to control pending count
vi.mock('@/lib/mock-data', () => ({
  USE_MOCK: true,
  MOCK_PROPOSALS: [
    { id: 'p1', status: 'pending' },
    { id: 'p2', status: 'pending' },
    { id: 'p3', status: 'executed' },
  ],
}))

import { usePathname } from 'next/navigation'

describe('NavTabs', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/')
  })

  it('renders 4 tabs', () => {
    render(<NavTabs />)
    expect(screen.getByText('Home')).toBeTruthy()
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Proposals')).toBeTruthy()
    expect(screen.getByText('History')).toBeTruthy()
  })

  it('shows pending badge on Proposals when there are pending proposals', () => {
    render(<NavTabs />)
    // 2 pending in mock (p1, p2)
    expect(screen.getByText('2')).toBeTruthy()
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
