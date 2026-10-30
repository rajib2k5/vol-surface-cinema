import { describe, expect, it } from 'vitest'
import { butterflyG, kRange } from '../synth/arbitrage.ts'
import { ssviSlice, ssviW, type SsviParams } from '../synth/ssvi.ts'
import { butterflyGridCheck, calendarGridCheck } from './gridChecks.ts'

/** A [dte][k] IV grid from an SSVI slice per expiry, so the exact answer is known. */
function ssviGrid(p: SsviParams, ks: number[], dte: number[]): number[][] {
  return dte.map((d) => ks.map((k) => Math.sqrt(ssviW(k, { ...p, theta: p.theta * (d / 30) }) / (d / 365))))
}

describe('calendarGridCheck', () => {
  const dte = [30, 60]
  it('counts cells where total variance falls with expiry', () => {
    // w = iv^2 * T. 0.20^2*30 = 1.2 ; 0.20^2*60 = 2.4 (ok). Second column: 0.30 then 0.10 -> w falls.
    const r = calendarGridCheck(
      [
        [0.2, 0.3],
        [0.2, 0.1],
      ],
      dte,
    )
    expect(r.cells).toBe(2)
    expect(r.violations).toBe(1)
    expect(r.worst).toBeLessThan(0)
  })
  it('flat total variance is not a violation', () => {
    const iv = [[0.2], [0.2 / Math.sqrt(2)]] // w equal at both expiries
    expect(calendarGridCheck(iv, dte).violations).toBe(0)
  })
  it('a rising surface has none', () => {
    expect(calendarGridCheck([[0.2], [0.2]], dte)).toMatchObject({ violations: 0, worst: 0 })
  })
  it('rejects a grid whose shape does not match dte', () => {
    expect(() => calendarGridCheck([[0.2]], dte)).toThrow(RangeError)
  })
})

describe('butterflyGridCheck', () => {
  const ks = kRange(-0.5, 0.5, 201)
  const good: SsviParams = { theta: 0.04, rho: -0.4, eta: 0.8 }
  it('agrees with the analytic g on a fine SSVI grid (central differences)', () => {
    const iv = ssviGrid(good, ks, [30])
    const r = butterflyGridCheck(iv, ks, [30])
    // The grid theta is theta*(30/30) = theta at 30 days, so compare with the analytic slice.
    const analytic = Math.min(...ks.slice(1, -1).map((k) => butterflyG(k, ssviSlice(k, good))))
    expect(r.cells).toBe(199)
    expect(r.violations).toBe(0)
    expect(r.min).toBeCloseTo(analytic, 2)
  })
  it('flags the known-bad SSVI control (eta(1+|rho|) = 5, theta = 0.02)', () => {
    const bad: SsviParams = { theta: 0.02, rho: -0.8, eta: 5 / 1.8 }
    const iv = ssviGrid(bad, ks, [30])
    const r = butterflyGridCheck(iv, ks, [30])
    expect(r.violations).toBeGreaterThan(0)
    expect(r.min).toBeLessThan(0)
  })
  it('a constant-vol slice has g = 1 everywhere', () => {
    const r = butterflyGridCheck([[0.2, 0.2, 0.2, 0.2]], [-0.1, 0, 0.1, 0.2], [30])
    expect(r.violations).toBe(0)
    expect(r.min).toBeCloseTo(1, 12)
  })
  it('works on a non-uniform k grid', () => {
    // w(k) = a + b k^2 sampled unevenly: w' = 2bk, w'' = 2b exactly recovered by the 3-point formulas.
    const a = 0.05
    const b = 0.3
    const kk = [-0.3, -0.2, -0.05, 0.1, 0.25]
    const T = 30 / 365
    const iv = [kk.map((k) => Math.sqrt((a + b * k * k) / T))]
    const r = butterflyGridCheck(iv, kk, [30])
    const expected = Math.min(...kk.slice(1, -1).map((k) => butterflyG(k, { w: a + b * k * k, w1: 2 * b * k, w2: 2 * b })))
    expect(r.min).toBeCloseTo(expected, 10)
  })
  it('rejects fewer than 3 strikes', () => {
    expect(() => butterflyGridCheck([[0.2, 0.2]], [0, 1], [30])).toThrow(RangeError)
  })
})
