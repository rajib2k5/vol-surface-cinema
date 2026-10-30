import { describe, expect, it } from 'vitest'
import { gaussian, mulberry32 } from './prng.ts'

describe('mulberry32', () => {
  it('is deterministic: the same seed gives the same stream, a different seed a different one', () => {
    const a = mulberry32(20301)
    const b = mulberry32(20301)
    const c = mulberry32(20302)
    const sa = Array.from({ length: 5 }, a)
    expect(Array.from({ length: 5 }, b)).toEqual(sa)
    expect(Array.from({ length: 5 }, c)).not.toEqual(sa)
  })
  it('pins the first outputs of seed 1 (golden values from the reference algorithm)', () => {
    // Reference: t = a += 0x6D2B79F5; t = imul(t ^ t>>>15, t|1); t ^= t + imul(t ^ t>>>7, t|61); (t ^ t>>>14)>>>0 / 2^32
    const r = mulberry32(1)
    expect([r(), r(), r()]).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522])
  })
  it('stays in [0, 1) and has mean near 0.5', () => {
    const r = mulberry32(7)
    let sum = 0
    for (let i = 0; i < 20000; i++) {
      const x = r()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
      sum += x
    }
    expect(sum / 20000).toBeGreaterThan(0.49)
    expect(sum / 20000).toBeLessThan(0.51)
  })
})

describe('gaussian', () => {
  it('has mean near 0 and standard deviation near 1', () => {
    const r = mulberry32(42)
    const xs = Array.from({ length: 20000 }, () => gaussian(r))
    const m = xs.reduce((s, x) => s + x, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length)
    expect(Math.abs(m)).toBeLessThan(0.03)
    expect(Math.abs(sd - 1)).toBeLessThan(0.03)
    expect(xs.every(Number.isFinite)).toBe(true)
  })
})
