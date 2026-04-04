'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { fetchLatestAgentId } from '@/components/sync4-client'
import { setLocalStorageValue, useLocalStorageValue } from '@/lib/client-storage'

export function useAgentId() {
  const storedAgentId = useLocalStorageValue('hbc_agentId')
  const [agentIdOverride, setAgentIdOverride] = useState<string | null | undefined>(undefined)
  const hydrated = typeof window !== 'undefined'
  const shouldRecover = hydrated && !(agentIdOverride ?? storedAgentId)
  const {
    data: recoveredAgentId,
    error: resolveError,
    isLoading: isResolving,
  } = useSWR(shouldRecover ? 'sync4:latest-agent-id' : null, fetchLatestAgentId, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })

  const agentId = agentIdOverride ?? storedAgentId ?? recoveredAgentId ?? null

  useEffect(() => {
    if (!storedAgentId && recoveredAgentId) {
      setLocalStorageValue('hbc_agentId', recoveredAgentId)
    }
  }, [recoveredAgentId, storedAgentId])

  const setAgentId = (nextAgentId: string | null) => {
    if (nextAgentId) {
      setLocalStorageValue('hbc_agentId', nextAgentId)
    } else if (typeof window !== 'undefined') {
      window.localStorage.removeItem('hbc_agentId')
      window.dispatchEvent(
        new CustomEvent<{ key: 'hbc_agentId' }>('hbc-storage', {
          detail: { key: 'hbc_agentId' },
        })
      )
    }
    setAgentIdOverride(nextAgentId)
  }

  return {
    agentId,
    hydrated,
    isResolving: shouldRecover && isResolving,
    resolveError,
    setAgentId,
  }
}
