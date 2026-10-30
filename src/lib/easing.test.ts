import { describe, expect, it } from 'vitest'
import { ease } from './easing.ts'

describe('ease', () => {
  it.each(['linear', 'smoothstep', 'easeInOutCubic'] as const)('%s: ease(0) = 0 and ease(1) = 1', (kind) => {
    expect(ease(kind, 0)).toBe(0)
    expect(ease(kind, 1)).toBeCloseTo(1, 15)
  })
  it.each(['linear', 'smoothstep', 'easeInOutCubic'] as const)('%s is monotone non-decreasing on [0, 1]', (kind) => {
    let prev = -Infinity
    for (let i = 0; i <= 1000; i++) {
      const v = ease(kind, i / 1000)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
  it('linear is the identity', () => {
    expect(ease('linear', 0.25)).toBe(0.25)
  })
  it('smoothstep = 3x^2 - 2x^3: 0.25 -> 0.15625, 0.5 -> 0.5', () => {
    expect(ease('smoothstep', 0.25)).toBeCloseTo(0.15625, 14)
    expect(ease('smoothstep', 0.5)).toBeCloseTo(0.5, 14)
  })
  it('easeInOutCubic: 0.25 -> 4 * 0.25^3 = 0.0625, 0.5 -> 0.5, 0.75 -> 0.9375', () => {
    expect(ease('easeInOutCubic', 0.25)).toBeCloseTo(0.0625, 14)
    expect(ease('easeInOutCubic', 0.5)).toBeCloseTo(0.5, 14)
    expect(ease('easeInOutCubic', 0.75)).toBeCloseTo(0.9375, 14)
  })
  it('rejects x outside [0, 1] and NaN', () => {
    expect(() => ease('linear', -0.1)).toThrow(RangeError)
    expect(() => ease('linear', 1.1)).toThrow(RangeError)
    expect(() => ease('linear', NaN)).toThrow(RangeError)
  })
})
