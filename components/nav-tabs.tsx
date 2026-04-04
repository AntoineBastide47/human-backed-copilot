'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import useSWR from 'swr'
import { fetchJson, isApiError, normalizeProposalList } from '@/components/sync4-client'
import { useAgentId } from '@/components/use-agent-id'

const TABS = [
  { label: 'Home',      href: '/',               icon: 'home' },
  { label: 'Dashboard', href: '/dashboard',       icon: 'analytics' },
  { label: 'Proposals', href: '/agent/proposals', icon: 'description' },
  { label: 'History',   href: '/agent/history',   icon: 'history' },
] as const

const fetcher = async (url: string) => normalizeProposalList(await fetchJson<unknown>(url))

export function NavTabs() {
  const pathname = usePathname()
  const { agentId, setAgentId } = useAgentId()

  const { data: proposals, error } = useSWR(
    agentId ? `/api/agents/${agentId}/proposals?status=pending` : null,
    fetcher,
    { refreshInterval: 5000 }
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
      className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pt-2 pb-6 bg-white/90 backdrop-blur-xl z-50 rounded-t-xl border-t border-slate-200/20 shadow-[0_-4px_24px_rgba(38,52,61,0.06)]"
    >
      {TABS.map(({ label, href, icon }) => {
        const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center justify-center py-2 px-4 rounded-xl transition-all duration-200 ${
              isActive
                ? 'bg-slate-100 text-black'
                : 'text-stone-400'
            }`}
          >
            <span className="relative">
              <span className="material-symbols-outlined text-[22px]">{icon}</span>
              {label === 'Proposals' && pendingCount > 0 && (
                <span
                  data-testid="pending-badge"
                  className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 bg-error text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none"
                >
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium tracking-[0.05em] uppercase mt-1">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
