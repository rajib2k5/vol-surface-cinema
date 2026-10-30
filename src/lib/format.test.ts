import { describe, it, expect } from 'vitest'
import { fmt, pct } from './format.ts'

describe('formatters', () => {
  it('fmt formats with thousands separators and fixed decimals', () => {
    expect(fmt(1234.5678)).toBe('1,234.57')
    expect(fmt(1, 4)).toBe('1.0000')
  })
  it('pct converts a fraction to a percentage string', () => {
    expect(pct(0.1234)).toBe('12.34%')
    expect(pct(-0.5, 1)).toBe('-50.0%')
  })
  it('all return an em dash for non-finite input', () => {
    expect(fmt(NaN)).toBe('—')
    expect(pct(Infinity)).toBe('—')
  })
})
