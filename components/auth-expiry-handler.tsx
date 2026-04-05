'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AUTH_EXPIRED_EVENT, STORAGE_KEYS } from '@/components/sync4-client'
import { clearLocalStorageValue } from '@/lib/client-storage'

export function AuthExpiryHandler() {
  const router = useRouter()
  const pathname = usePathname()
  const isHandlingRef = useRef(false)

  useEffect(() => {
    const handleAuthExpired = () => {
      if (isHandlingRef.current) return
      isHandlingRef.current = true

      void fetch('/api/logout', {
        method: 'POST',
        keepalive: true,
      }).catch(() => {
        // Clearing client state is still enough to recover the UI.
      })

      clearLocalStorageValue(STORAGE_KEYS.agentId)
      clearLocalStorageValue(STORAGE_KEYS.userId)
      clearLocalStorageValue(STORAGE_KEYS.walletAddress)

      if (pathname !== '/') {
        router.replace('/')
      }
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    }
  }, [pathname, router])

  return null
}
