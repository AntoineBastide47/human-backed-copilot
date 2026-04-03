import { describe, it, expect } from 'vitest'
import {
  EXTENDED_TOKEN_INFO,
  tokenDecimals,
  tokenSymbol,
  toTokenAmount,
  fromTokenAmount,
} from '../lib/mock-data'

const WETH  = '0x4200000000000000000000000000000000000006'
const USDC  = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1'
const WLD   = '0x163f8C2467924be0ae7B5347228CABF260318753'
const WBTC  = '0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa'
const UNKNOWN = '0x0000000000000000000000000000000000000000'

describe('EXTENDED_TOKEN_INFO', () => {
  it('covers all four World Chain tokens', () => {
    expect(Object.keys(EXTENDED_TOKEN_INFO)).toHaveLength(4)
    expect(EXTENDED_TOKEN_INFO[WETH].symbol).toBe('WETH')
    expect(EXTENDED_TOKEN_INFO[USDC].symbol).toBe('USDC')
    expect(EXTENDED_TOKEN_INFO[WLD].symbol).toBe('WLD')
    expect(EXTENDED_TOKEN_INFO[WBTC].symbol).toBe('WBTC')
  })

  it('has correct decimals', () => {
    expect(EXTENDED_TOKEN_INFO[USDC].decimals).toBe(6)
    expect(EXTENDED_TOKEN_INFO[WETH].decimals).toBe(18)
    expect(EXTENDED_TOKEN_INFO[WLD].decimals).toBe(18)
    expect(EXTENDED_TOKEN_INFO[WBTC].decimals).toBe(8)
  })
})

describe('tokenDecimals', () => {
  it('returns 6 for USDC', () => expect(tokenDecimals(USDC)).toBe(6))
  it('returns 18 for WETH', () => expect(tokenDecimals(WETH)).toBe(18))
  it('returns 18 for WLD',  () => expect(tokenDecimals(WLD)).toBe(18))
  it('returns 8 for WBTC',  () => expect(tokenDecimals(WBTC)).toBe(8))
  it('defaults to 18 for unknown address', () => expect(tokenDecimals(UNKNOWN)).toBe(18))
})

describe('tokenSymbol', () => {
  it('returns USDC', () => expect(tokenSymbol(USDC)).toBe('USDC'))
  it('returns WETH', () => expect(tokenSymbol(WETH)).toBe('WETH'))
  it('returns WLD',  () => expect(tokenSymbol(WLD)).toBe('WLD'))
  it('returns WBTC', () => expect(tokenSymbol(WBTC)).toBe('WBTC'))
  it('truncates unknown address to 6 chars + ellipsis', () => {
    expect(tokenSymbol(UNKNOWN)).toBe('0x0000…')
  })
})

describe('toTokenAmount', () => {
  it('converts 1 WETH to 1e18', () => {
    expect(toTokenAmount('1', WETH)).toBe('1000000000000000000')
  })
  it('converts 0.5 WETH to 5e17', () => {
    expect(toTokenAmount('0.5', WETH)).toBe('500000000000000000')
  })
  it('converts 100 USDC to 100_000_000 (6 decimals)', () => {
    expect(toTokenAmount('100', USDC)).toBe('100000000')
  })
  it('converts 0.001 WBTC to 100_000 (8 decimals)', () => {
    expect(toTokenAmount('0.001', WBTC)).toBe('100000')
  })
  it('returns a string (not a number)', () => {
    expect(typeof toTokenAmount('1', WETH)).toBe('string')
  })
  it('handles zero', () => {
    expect(toTokenAmount('0', WETH)).toBe('0')
  })
})

describe('fromTokenAmount', () => {
  it('converts 1e18 raw WETH to "1.0000"', () => {
    expect(fromTokenAmount('1000000000000000000', WETH)).toBe('1.0000')
  })
  it('converts 5e17 raw WETH to "0.5000"', () => {
    expect(fromTokenAmount('500000000000000000', WETH)).toBe('0.5000')
  })
  it('converts 100_000_000 raw USDC to "100.00"', () => {
    expect(fromTokenAmount('100000000', USDC)).toBe('100.00')
  })
  it('uses 2 d.p. for low-decimal tokens (USDC, WBTC)', () => {
    expect(fromTokenAmount('100000', WBTC)).toBe('0.00')  // 100000 / 1e8 = 0.001 → 0.00
    expect(fromTokenAmount('1000000', WBTC)).toBe('0.01') // 1e6 / 1e8 = 0.01
  })
  it('round-trips with toTokenAmount for WETH', () => {
    const raw = toTokenAmount('1.5', WETH)
    expect(fromTokenAmount(raw, WETH)).toBe('1.5000')
  })
  it('round-trips with toTokenAmount for USDC', () => {
    const raw = toTokenAmount('50.25', USDC)
    expect(fromTokenAmount(raw, USDC)).toBe('50.25')
  })
})
