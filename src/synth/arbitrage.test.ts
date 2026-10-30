import { describe, expect, it } from 'vitest'
import { butterflyG, calendarViolations, kRange, minButterflyG, mixSlices, sliceArrays } from './arbitrage.ts'

describe('butterflyG', () => {
  it('flat total variance w = c (w\' = w\'\' = 0) gives g = 1 - 0 - 0 + 0 = 1', () => {
    expect(butterflyG(0.3, { w: 0.04, w1: 0, w2: 0 })).toBeCloseTo(1, 14)
  })
  it('hand-worked: k = 0, w = 0.04, w\' = 0, w\'\' = 0.2 -> g = 1 + 0.1 = 1.1', () => {
    expect(butterflyG(0, { w: 0.04, w1: 0, w2: 0.2 })).toBeCloseTo(1.1, 14)
  })
  it('hand-worked: k = 1, w = 1, w\' = 0.5, w\'\' = 0 -> (1 - 0.25)^2 - 0.0625 * 1.25 = 0.484375', () => {
    expect(butterflyG(1, { w: 1, w1: 0.5, w2: 0 })).toBeCloseTo(0.484375, 14)
  })
})

describe('kRange', () => {
  it('has 2001 points on [-1.5, 1.5]', () => {
    const ks = kRange(-1.5, 1.5, 2001)
    expect(ks).toHaveLength(2001)
    expect(ks[0]).toBe(-1.5)
    expect(ks[2000]).toBe(1.5)
    expect(ks[1000]).toBeCloseTo(0, 14)
  })
})

describe('sliceArrays, mixSlices and minButterflyG', () => {
  const ks = kRange(-1.5, 1.5, 301)
  const a = sliceArrays(ks, { theta: 0.04, rho: -0.5, eta: 0.7 })
  const b = sliceArrays(ks, { theta: 0.09, rho: -0.2, eta: 0.9 })
  it('mix with alpha 0 is a, alpha 1 is b, and alpha 0.25 is the convex combination of every array', () => {
    expect(Array.from(mixSlices(a, b, 0).w)).toEqual(Array.from(a.w))
    expect(Array.from(mixSlices(a, b, 1).w2)).toEqual(Array.from(b.w2))
    const m = mixSlices(a, b, 0.25)
    for (const i of [0, 77, 150, 300]) {
      expect(m.w[i]).toBeCloseTo(0.75 * a.w[i] + 0.25 * b.w[i], 14)
      expect(m.w1[i]).toBeCloseTo(0.75 * a.w1[i] + 0.25 * b.w1[i], 14)
      expect(m.w2[i]).toBeCloseTo(0.75 * a.w2[i] + 0.25 * b.w2[i], 14)
    }
  })
  it('mixSlices writes into `out` when given one', () => {
    const out = sliceArrays(ks, { theta: 1, rho: 0, eta: 1 })
    const ret = mixSlices(a, b, 0.5, out)
    expect(ret).toBe(out)
    expect(out.w[0]).toBeCloseTo(0.5 * a.w[0] + 0.5 * b.w[0], 14)
  })
  it('an arbitrage-free SSVI slice has min g > 0', () => {
    expect(minButterflyG(ks, a)).toBeGreaterThan(0)
  })
})

describe('calendarViolations', () => {
  const ks = kRange(-1, 1, 21)
  it('counts the k points where the later slice has LESS total variance than the earlier one', () => {
    const lo = sliceArrays(ks, { theta: 0.04, rho: -0.5, eta: 0.7 })
    const hi = sliceArrays(ks, { theta: 0.08, rho: -0.5, eta: 0.7 })
    expect(calendarViolations(lo, hi)).toBe(0)
    expect(calendarViolations(hi, lo)).toBe(21) // theta falls: every k violates
  })
})
