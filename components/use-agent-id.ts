'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import useSWR from 'swr'
import { fetchLatestAgentId, readStoredValue, persistAgentId, STORAGE_KEYS } from '@/components/sync4-client'

function subscribeToStorage() {
  return () => {}
}

export function useAgentId() {
  const storedAgentId = useSyncExternalStore(
    subscribeToStorage,
    () => readStoredValue(STORAGE_KEYS.agentId),
    () => null
  )
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
      persistAgentId(recoveredAgentId)
    }
  }, [recoveredAgentId, storedAgentId])

  const setAgentId = (nextAgentId: string | null) => {
    persistAgentId(nextAgentId)
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
