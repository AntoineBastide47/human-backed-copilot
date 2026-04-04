import * as constants from '@/lib/constants'
import type { Agent, Execution, PaginatedResponse, Proposal } from '@/types'

const EXTRA_TOKEN_INFO = {
  '0x163f8c2467924be0ae7b5347228cabf260318753': {
    symbol: 'WLD',
    color: '#2563eb',
    decimals: 18,
  },
  '0x03c7054bcb39f7b2e5b2c7acb37583e32d70cfa': {
    symbol: 'WBTC',
    color: '#f59e0b',
    decimals: 8,
  },
} as const

const BASE_TOKEN_INFO = Object.fromEntries(
  Object.entries(constants.TOKEN_MAP ?? {}).map(([address, meta]) => [
    address.toLowerCase(),
    {
      ...meta,
      decimals: address.toLowerCase() === '0x79a02482a880bce3f13e09da970dc34db4cd24d1' ? 6 : 18,
    },
  ])
)

const TOKEN_INFO = {
  ...BASE_TOKEN_INFO,
  ...EXTRA_TOKEN_INFO,
}

export const STORAGE_KEYS = {
  agentId: 'hbc_agentId',
  userId: 'hbc_userId',
  walletAddress: 'hbc_walletAddress',
} as const

export type ProposalRecord = Proposal & { txHash?: string }
export type ExecutionRecord = Execution & { tokenIn?: string; tokenOut?: string }

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFormDataBody(body: BodyInit | null | undefined): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData
}

function ensureJsonHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('Content-Type') && !isFormDataBody(init.body)) {
    headers.set('Content-Type', 'application/json')
  }
  return headers
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: ensureJsonHeaders(init),
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      isRecord(body) && typeof body.error === 'string'
        ? body.error
        : `Request failed: ${response.status}`

    throw new ApiError(message, response.status)
  }

  return body as T
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function readStoredValue(key: string): string | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStoredValue(key: string, value: string | null) {
  if (typeof window === 'undefined') return

  try {
    if (value === null) {
      window.localStorage.removeItem(key)
      return
    }

    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures inside constrained webviews.
  }
}

export function persistAgentId(agentId: string | null) {
  writeStoredValue(STORAGE_KEYS.agentId, agentId)
}

export function tokenDecimals(address?: string | null): number {
  if (!address) return 18
  return TOKEN_INFO[address.toLowerCase() as keyof typeof TOKEN_INFO]?.decimals ?? 18
}

export function tokenSymbol(address?: string | null): string {
  if (!address) return 'Token'

  return (
    TOKEN_INFO[address.toLowerCase() as keyof typeof TOKEN_INFO]?.symbol ??
    `${address.slice(0, 6)}...`
  )
}

export function formatTokenAmount(
  rawAmount: string,
  address?: string | null,
  precision?: number
): string {
  const decimals = tokenDecimals(address)
  const digits = precision ?? (decimals <= 8 ? 2 : 4)
  const zeroValue = digits > 0 ? `0.${'0'.repeat(digits)}` : '0'

  try {
    const amount = BigInt(rawAmount)
    const divisor = 10n ** BigInt(decimals)
    const scale = 10n ** BigInt(digits)
    const rounded = (amount * scale + divisor / 2n) / divisor
    const whole = rounded / scale

    if (digits === 0) return whole.toString()

    const fraction = (rounded % scale).toString().padStart(digits, '0')
    return `${whole.toString()}.${fraction}`
  } catch {
    return zeroValue
  }
}

export function toTokenAmount(humanAmount: string, address?: string | null): string {
  const normalized = humanAmount.trim()
  const decimals = tokenDecimals(address)

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Enter a valid amount')
  }

  const [wholePart, fractionPart = ''] = normalized.split('.')
  if (fractionPart.length > decimals && /[1-9]/.test(fractionPart.slice(decimals))) {
    throw new Error(`Amount supports up to ${decimals} decimal places`)
  }

  const whole = BigInt(wholePart || '0')
  const paddedFraction = (fractionPart.slice(0, decimals) + '0'.repeat(decimals)).slice(0, decimals)
  const fraction = BigInt(paddedFraction || '0')
  const raw = whole * 10n ** BigInt(decimals) + fraction

  if (raw <= 0n) {
    throw new Error('Amount must be greater than 0')
  }

  return raw.toString()
}

export function normalizeProposalList(payload: unknown): ProposalRecord[] {
  if (Array.isArray(payload)) {
    return payload as ProposalRecord[]
  }

  if (isRecord(payload) && Array.isArray(payload.data)) {
    return payload.data as ProposalRecord[]
  }

  return []
}

export function normalizeExecutionPage(payload: unknown): PaginatedResponse<ExecutionRecord> {
  if (Array.isArray(payload)) {
    return {
      data: payload as ExecutionRecord[],
      nextCursor: null,
    }
  }

  if (isRecord(payload) && Array.isArray(payload.data)) {
    return {
      data: payload.data as ExecutionRecord[],
      nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
    }
  }

  return {
    data: [],
    nextCursor: null,
  }
}

export function removeProposalFromList(payload: unknown, proposalId: string): ProposalRecord[] {
  return normalizeProposalList(payload).filter((proposal) => proposal.id !== proposalId)
}

export function prependExecutionToPage(
  payload: unknown,
  execution: ExecutionRecord
): PaginatedResponse<ExecutionRecord> {
  const page = normalizeExecutionPage(payload)

  return {
    ...page,
    data: [
      execution,
      ...page.data.filter(
        (item) => item.id !== execution.id && item.proposalId !== execution.proposalId
      ),
    ],
  }
}

export async function fetchLatestAgentId(): Promise<string | null> {
  const agents = await fetchJson<Agent[]>('/api/agents')
  const latestAgentId = agents[0]?.id ?? null

  if (latestAgentId) {
    persistAgentId(latestAgentId)
  }

  return latestAgentId
}
