// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ApiError,
  AUTH_EXPIRED_EVENT,
  isApiError,
  fetchJson,
  tokenDecimals,
  tokenSymbol,
  formatTokenAmount,
  toTokenAmount,
  normalizeProposalList,
  normalizeExecutionPage,
  removeProposalFromList,
  prependExecutionToPage,
  readStoredValue,
  writeStoredValue,
  persistAgentId,
  STORAGE_KEYS,
} from '../components/sync4-client'

// ── ApiError ──────────────────────────────────────────────────────────────────

describe('ApiError', () => {
  it('is an instance of Error', () => {
    const err = new ApiError('not found', 404)
    expect(err).toBeInstanceOf(Error)
  })

  it('carries status and message', () => {
    const err = new ApiError('forbidden', 403)
    expect(err.status).toBe(403)
    expect(err.message).toBe('forbidden')
  })

  it('name is ApiError', () => {
    expect(new ApiError('x', 500).name).toBe('ApiError')
  })
})

describe('isApiError', () => {
  it('returns true for ApiError', () => {
    expect(isApiError(new ApiError('x', 401))).toBe(true)
  })
  it('returns false for plain Error', () => {
    expect(isApiError(new Error('x'))).toBe(false)
  })
  it('returns false for null', () => {
    expect(isApiError(null)).toBe(false)
  })
  it('narrows status field', () => {
    const err = new ApiError('not found', 404)
    if (isApiError(err)) {
      expect(err.status).toBe(404)
    }
  })
})

// ── fetchJson ─────────────────────────────────────────────────────────────────

describe('fetchJson', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON on 2xx', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'abc' }),
    } as Response)
    const result = await fetchJson<{ id: string }>('/api/test')
    expect(result.id).toBe('abc')
  })

  it('throws ApiError with server message on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: 'invalid input' }),
    } as Response)
    await expect(fetchJson('/api/test')).rejects.toMatchObject({
      message: 'invalid input',
      status: 422,
    })
  })

  it('throws ApiError with generic message when body has no error field', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response)
    await expect(fetchJson('/api/test')).rejects.toMatchObject({
      message: 'Request failed: 500',
      status: 500,
    })
  })

  it('dispatches an auth-expired event on 401 responses', async () => {
    const onExpired = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Missing session cookie' }),
    } as Response)

    await expect(fetchJson('/api/test')).rejects.toMatchObject({
      message: 'Missing session cookie',
      status: 401,
    })

    expect(onExpired).toHaveBeenCalledTimes(1)
    window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  })

  it('sets Content-Type: application/json for JSON body', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)
    await fetchJson('/api/test', { method: 'POST', body: JSON.stringify({ x: 1 }) })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('content-type')).toBe('application/json')
  })

  it('does not override manually-set Content-Type', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)
    await fetchJson('/api/test', {
      headers: { 'Content-Type': 'text/plain' },
      body: 'raw',
    })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('content-type')).toBe('text/plain')
  })
})

// ── Token utilities ───────────────────────────────────────────────────────────

const WETH = '0x4200000000000000000000000000000000000006'
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1'
const WLD  = '0x163f8C2467924be0ae7B5347228CABF260318753'
const WBTC = '0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa'
const UNKNOWN = '0x0000000000000000000000000000000000000000'

describe('tokenDecimals', () => {
  it('USDC → 6', () => expect(tokenDecimals(USDC)).toBe(6))
  it('WETH → 18', () => expect(tokenDecimals(WETH)).toBe(18))
  it('WLD → 18',  () => expect(tokenDecimals(WLD)).toBe(18))
  it('WBTC → 8',  () => expect(tokenDecimals(WBTC)).toBe(8))
  it('unknown → 18', () => expect(tokenDecimals(UNKNOWN)).toBe(18))
  it('null → 18',    () => expect(tokenDecimals(null)).toBe(18))
  it('undefined → 18', () => expect(tokenDecimals(undefined)).toBe(18))
  it('is case-insensitive', () => {
    expect(tokenDecimals(USDC.toUpperCase())).toBe(6)
    expect(tokenDecimals(WETH.toLowerCase())).toBe(18)
  })
})

describe('tokenSymbol', () => {
  it('USDC → "USDC"', () => expect(tokenSymbol(USDC)).toBe('USDC'))
  it('WETH → "WETH"', () => expect(tokenSymbol(WETH)).toBe('WETH'))
  it('WLD → "WLD"',   () => expect(tokenSymbol(WLD)).toBe('WLD'))
  it('WBTC → "WBTC"', () => expect(tokenSymbol(WBTC)).toBe('WBTC'))
  it('unknown → truncated address', () => {
    expect(tokenSymbol(UNKNOWN)).toBe('0x0000...')
  })
  it('null → "Token"',      () => expect(tokenSymbol(null)).toBe('Token'))
  it('undefined → "Token"', () => expect(tokenSymbol(undefined)).toBe('Token'))
})

describe('formatTokenAmount', () => {
  it('1 WETH (18 dec, 4 dp) → "1.0000"', () => {
    expect(formatTokenAmount('1000000000000000000', WETH, 4)).toBe('1.0000')
  })
  it('0.5 WETH → "0.5000"', () => {
    expect(formatTokenAmount('500000000000000000', WETH, 4)).toBe('0.5000')
  })
  it('100 USDC (6 dec, 2 dp) → "100.00"', () => {
    expect(formatTokenAmount('100000000', USDC, 2)).toBe('100.00')
  })
  it('912 USDC → "912.00"', () => {
    expect(formatTokenAmount('912000000', USDC, 2)).toBe('912.00')
  })
  it('0.001 WBTC → "0.00" at 2 dp', () => {
    expect(formatTokenAmount('100000', WBTC, 2)).toBe('0.00')
  })
  it('returns zero string on invalid input', () => {
    expect(formatTokenAmount('not-a-number', WETH, 4)).toBe('0.0000')
  })
  it('formats decimal strings directly when passed a human-readable quote', () => {
    expect(formatTokenAmount('1.82', USDC, 2)).toBe('1.82')
  })
  it('returns zero string on empty string', () => {
    expect(formatTokenAmount('', WETH, 4)).toBe('0.0000')
  })
  it('uses default precision (4 dp for 18-dec tokens)', () => {
    expect(formatTokenAmount('1000000000000000000', WETH)).toBe('1.0000')
  })
  it('uses default precision (2 dp for 6-dec tokens)', () => {
    expect(formatTokenAmount('1000000', USDC)).toBe('1.00')
  })
})

describe('toTokenAmount', () => {
  it('1 WETH → "1000000000000000000"', () => {
    expect(toTokenAmount('1', WETH)).toBe('1000000000000000000')
  })
  it('0.5 WETH → "500000000000000000"', () => {
    expect(toTokenAmount('0.5', WETH)).toBe('500000000000000000')
  })
  it('100 USDC → "100000000"', () => {
    expect(toTokenAmount('100', USDC)).toBe('100000000')
  })
  it('0.001 WBTC → "100000"', () => {
    expect(toTokenAmount('0.001', WBTC)).toBe('100000')
  })
  it('throws on non-numeric input', () => {
    expect(() => toTokenAmount('abc', WETH)).toThrow('Enter a valid amount')
  })
  it('throws on zero', () => {
    expect(() => toTokenAmount('0', WETH)).toThrow('Amount must be greater than 0')
  })
  it('throws on negative (via invalid pattern)', () => {
    expect(() => toTokenAmount('-1', WETH)).toThrow('Enter a valid amount')
  })
  it('throws when fraction exceeds token decimals', () => {
    expect(() => toTokenAmount('1.0000001', USDC)).toThrow('up to 6 decimal places')
  })
  it('round-trips with formatTokenAmount', () => {
    const raw = toTokenAmount('1.5', WETH)
    expect(formatTokenAmount(raw, WETH, 4)).toBe('1.5000')
  })
})

// ── Response normalizers ──────────────────────────────────────────────────────

describe('normalizeProposalList', () => {
  const p = { id: 'p1', status: 'pending' }

  it('passes through arrays', () => {
    expect(normalizeProposalList([p])).toEqual([p])
  })
  it('unwraps paginated { data: [] }', () => {
    expect(normalizeProposalList({ data: [p], nextCursor: null })).toEqual([p])
  })
  it('returns [] for null', () => {
    expect(normalizeProposalList(null)).toEqual([])
  })
  it('returns [] for non-array/non-object', () => {
    expect(normalizeProposalList('bad')).toEqual([])
  })
  it('returns [] for empty array', () => {
    expect(normalizeProposalList([])).toEqual([])
  })
})

describe('normalizeExecutionPage', () => {
  const e = { id: 'e1', txHash: '0xabc' }

  it('wraps bare array in paginated shape', () => {
    const result = normalizeExecutionPage([e])
    expect(result.data).toEqual([e])
    expect(result.nextCursor).toBeNull()
  })
  it('passes through paginated response', () => {
    const result = normalizeExecutionPage({ data: [e], nextCursor: 'cursor1' })
    expect(result.data).toEqual([e])
    expect(result.nextCursor).toBe('cursor1')
  })
  it('returns empty page for null', () => {
    const result = normalizeExecutionPage(null)
    expect(result.data).toEqual([])
    expect(result.nextCursor).toBeNull()
  })
})

describe('removeProposalFromList', () => {
  const proposals = [
    { id: 'p1', status: 'pending' },
    { id: 'p2', status: 'pending' },
  ]

  it('removes the target proposal', () => {
    const result = removeProposalFromList(proposals, 'p1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('p2')
  })
  it('returns full list when id not found', () => {
    expect(removeProposalFromList(proposals, 'p99')).toHaveLength(2)
  })
  it('handles undefined input', () => {
    expect(removeProposalFromList(undefined, 'p1')).toEqual([])
  })
})

describe('prependExecutionToPage', () => {
  const existing = {
    id: 'e1', agentId: 'a', strategyId: 's', proposalId: 'p-old',
    txHash: '0x1', amountIn: '1', amountOut: '1', status: 'confirmed' as const,
    executedAt: new Date().toISOString(),
  }
  const newExec = {
    id: 'optimistic-p1', agentId: 'a', strategyId: 's', proposalId: 'p1',
    txHash: '0xnew', amountIn: '1', amountOut: '1', status: 'confirmed' as const,
    executedAt: new Date().toISOString(),
  }

  it('prepends the new execution to the front', () => {
    const page = { data: [existing], nextCursor: null }
    const result = prependExecutionToPage(page, newExec)
    expect(result.data[0].id).toBe('optimistic-p1')
    expect(result.data[1].id).toBe('e1')
  })

  it('deduplicates by proposalId', () => {
    const duplicate = { ...existing, id: 'dup', proposalId: 'p1' }
    const page = { data: [duplicate], nextCursor: null }
    const result = prependExecutionToPage(page, newExec)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe('optimistic-p1')
  })

  it('handles empty current page', () => {
    const result = prependExecutionToPage(null, newExec)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe('optimistic-p1')
  })

  it('preserves nextCursor', () => {
    const page = { data: [], nextCursor: 'cursor-abc' }
    const result = prependExecutionToPage(page, newExec)
    expect(result.nextCursor).toBe('cursor-abc')
  })
})

// ── Storage helpers ───────────────────────────────────────────────────────────

describe('readStoredValue / writeStoredValue', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads via localStorage.getItem', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('agent-123')
    expect(readStoredValue(STORAGE_KEYS.agentId)).toBe('agent-123')
    expect(localStorage.getItem).toHaveBeenCalledWith('hbc_agentId')
  })

  it('returns null when key not set', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    expect(readStoredValue('hbc_userId')).toBeNull()
  })

  it('writes via localStorage.setItem', () => {
    writeStoredValue(STORAGE_KEYS.agentId, 'agent-abc')
    expect(localStorage.setItem).toHaveBeenCalledWith('hbc_agentId', 'agent-abc')
  })

  it('removes via localStorage.removeItem when value is null', () => {
    writeStoredValue(STORAGE_KEYS.agentId, null)
    expect(localStorage.removeItem).toHaveBeenCalledWith('hbc_agentId')
  })
})

describe('persistAgentId', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('writes agentId to hbc_agentId', () => {
    persistAgentId('agent-xyz')
    expect(localStorage.setItem).toHaveBeenCalledWith('hbc_agentId', 'agent-xyz')
  })

  it('removes hbc_agentId when null', () => {
    persistAgentId(null)
    expect(localStorage.removeItem).toHaveBeenCalledWith('hbc_agentId')
  })
})
