'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import useSWR from 'swr'
import { fetchJson, isApiError, normalizeProposalList } from '@/components/sync4-client'
import { useAgentId } from '@/components/use-agent-id'

// Simple inline SVG tab icons — no external deps
function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}
function DashboardIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  )
}
function ProposalIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="12" y2="17" />
    </svg>
  )
}
function HistoryIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="12 8 12 12 14 14" />
      <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
    </svg>
  )
}

const TABS = [
  { label: 'Home',      href: '/',               Icon: HomeIcon },
  { label: 'Dashboard', href: '/dashboard',       Icon: DashboardIcon },
  { label: 'Proposals', href: '/agent/proposals', Icon: ProposalIcon },
  { label: 'History',   href: '/agent/history',   Icon: HistoryIcon },
] as const

const fetcher = async (url: string) => normalizeProposalList(await fetchJson<unknown>(url))

export function NavTabs() {
  const pathname = usePathname()
  const { agentId, setAgentId } = useAgentId()

  const { data: proposals, error } = useSWR(
    agentId ? `/api/agents/${agentId}/proposals?status=pending` : null,
    fetcher,
    {
      refreshInterval: 5000,
    }
  )

  useEffect(() => {
    if (isApiError(error) && error.status === 404) {
      setAgentId(null)
    }
  }, [error, setAgentId])

  const pendingCount = proposals?.length ?? 0

  return (
    <nav
      data-testid="nav-tabs"
      className="fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-stone-200 flex items-stretch z-50 safe-area-inset-bottom"
    >
      {TABS.map(({ label, href, Icon }) => {
        const isActive = href === '/'
          ? pathname === '/'
          : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              isActive ? 'text-black' : 'text-stone-400'
            }`}
          >
            <span className="relative">
              <Icon active={isActive} />
              {label === 'Proposals' && pendingCount > 0 && (
                <span
                  data-testid="pending-badge"
                  className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none"
                >
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </span>
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
