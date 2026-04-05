'use client'

import { useSyncExternalStore } from 'react'

const STORAGE_EVENT = 'hbc-storage'

export type StorageKey = 'hbc_agentId' | 'hbc_userId' | 'hbc_walletAddress'

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

function readStorageValue(key: StorageKey): string | null {
  return getStorage()?.getItem(key) ?? null
}

function subscribeToStorage(
  key: StorageKey,
  onStoreChange: () => void,
): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleStorage = (event: StorageEvent) => {
    if (event.storageArea === window.localStorage && event.key === key) {
      onStoreChange()
    }
  }

  const handleCustomStorage = (event: Event) => {
    const detail = (event as CustomEvent<{ key?: StorageKey }>).detail
    if (!detail?.key || detail.key === key) {
      onStoreChange()
    }
  }

  window.addEventListener('storage', handleStorage)
  window.addEventListener(STORAGE_EVENT, handleCustomStorage)

  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(STORAGE_EVENT, handleCustomStorage)
  }
}

export function useLocalStorageValue(key: StorageKey): string | null {
  return useSyncExternalStore(
    (onStoreChange) => subscribeToStorage(key, onStoreChange),
    () => readStorageValue(key),
    () => null,
  )
}

export function getLocalStorageValue(key: StorageKey): string | null {
  return readStorageValue(key)
}

export function setLocalStorageValue(key: StorageKey, value: string): void {
  const storage = getStorage()
  if (!storage || typeof window === 'undefined') return

  storage.setItem(key, value)
  window.dispatchEvent(
    new CustomEvent<{ key: StorageKey }>(STORAGE_EVENT, { detail: { key } }),
  )
}

export function clearLocalStorageValue(key: StorageKey): void {
  const storage = getStorage()
  if (!storage || typeof window === 'undefined') return

  storage.removeItem(key)
  window.dispatchEvent(
    new CustomEvent<{ key: StorageKey }>(STORAGE_EVENT, { detail: { key } }),
  )
}
