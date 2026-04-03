import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  USE_MOCK,
  MOCK_AGENT,
  MOCK_STRATEGIES,
  MOCK_PROPOSALS,
  MOCK_EXECUTIONS,
  MOCK_VERIFY,
  apiFetch,
} from '@/lib/mock-data'
import { WORLD_CHAIN_ID, WORLD_USDC } from '@/lib/constants'

describe('USE_MOCK flag', () => {
  it('is a boolean', () => {
    expect(typeof USE_MOCK).toBe('boolean')
  })
})

describe('MOCK_AGENT', () => {
  it('has required Agent fields', () => {
    expect(MOCK_AGENT.id).toBeTruthy()
    expect(MOCK_AGENT.ownerId).toBeTruthy()
    expect(MOCK_AGENT.walletAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(['registering', 'active', 'paused']).toContain(MOCK_AGENT.status)
    expect(typeof MOCK_AGENT.usageCount).toBe('number')
    expect(typeof MOCK_AGENT.freeTrialRemaining).toBe('number')
    expect(MOCK_AGENT.spendLimits).toHaveProperty('maxPerTx')
    expect(MOCK_AGENT.spendLimits).toHaveProperty('dailyCap')
  })

  it('ensName ends with .copilot.eth when set', () => {
    if (MOCK_AGENT.ensName) {
      expect(MOCK_AGENT.ensName).toMatch(/\.copilot\.eth$/)
    }
  })
})

describe('MOCK_STRATEGIES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(MOCK_STRATEGIES)).toBe(true)
    expect(MOCK_STRATEGIES.length).toBeGreaterThan(0)
  })

  it('each strategy has required fields', () => {
    for (const s of MOCK_STRATEGIES) {
      expect(s.id).toBeTruthy()
      expect(s.agentId).toBe(MOCK_AGENT.id)
      expect(s.tokenIn).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(s.tokenOut).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(s.chainId).toBe(WORLD_CHAIN_ID)
      expect(['hourly', 'daily', 'weekly']).toContain(s.interval)
      expect(typeof s.autoExecute).toBe('boolean')
      expect(['active', 'paused']).toContain(s.status)
    }
  })
})

describe('MOCK_PROPOSALS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(MOCK_PROPOSALS)).toBe(true)
    expect(MOCK_PROPOSALS.length).toBeGreaterThan(0)
  })

  it('each proposal has required fields', () => {
    for (const p of MOCK_PROPOSALS) {
      expect(p.id).toBeTruthy()
      expect(p.agentId).toBeTruthy()
      expect(['dca_buy', 'rebalance']).toContain(p.type)
      expect(['pending', 'approved', 'rejected', 'executed']).toContain(p.status)
      // amount and estimatedOutput should be numeric strings
      expect(() => BigInt(p.amount)).not.toThrow()
      expect(() => BigInt(p.estimatedOutput)).not.toThrow()
    }
  })
})

describe('MOCK_EXECUTIONS', () => {
  it('txHash is a valid hex string', () => {
    for (const ex of MOCK_EXECUTIONS) {
      expect(ex.txHash).toMatch(/^0x[0-9a-fA-F]+$/)
    }
  })

  it('amountIn and amountOut are BigInt-safe strings', () => {
    for (const ex of MOCK_EXECUTIONS) {
      expect(() => BigInt(ex.amountIn)).not.toThrow()
      expect(() => BigInt(ex.amountOut)).not.toThrow()
    }
  })

  it('executedAt is a valid ISO date', () => {
    for (const ex of MOCK_EXECUTIONS) {
      expect(() => new Date(ex.executedAt)).not.toThrow()
      expect(new Date(ex.executedAt).getTime()).toBeGreaterThan(0)
    }
  })
})

describe('MOCK_VERIFY', () => {
  it('has userId and walletAddress', () => {
    expect(MOCK_VERIFY.userId).toBeTruthy()
    expect(MOCK_VERIFY.verified).toBe(true)
    expect(MOCK_VERIFY.walletAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })
})

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed JSON on 200', async () => {
    const mockData = { id: '123', status: 'active' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    }))
    const result = await apiFetch('/api/agents/123')
    expect(result).toEqual(mockData)
  })

  it('throws with error message on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Bad request' }),
    }))
    await expect(apiFetch('/api/agents/bad')).rejects.toThrow('Bad request')
  })

  it('throws with status code fallback when no error field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('invalid json')),
    }))
    await expect(apiFetch('/api/agents/bad')).rejects.toThrow('Request failed: 500')
  })

  it('merges Content-Type header with provided headers', async () => {
    let capturedInit: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedInit = init
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }))
    await apiFetch('/api/test', { headers: { Authorization: 'Bearer token' } })
    expect(capturedInit?.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token',
    })
  })
})

describe('constants consistency', () => {
  it('WORLD_USDC address is used in mock strategies', () => {
    const hasUSDC = MOCK_STRATEGIES.some(
      s => s.tokenIn === WORLD_USDC || s.tokenOut === WORLD_USDC
    )
    expect(hasUSDC).toBe(true)
  })
})
