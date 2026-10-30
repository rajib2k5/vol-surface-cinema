import { describe, expect, it } from 'vitest'
import { interpolateIv, makeIvBuffer, precomputeW } from './interpolate.ts'
import type { Sequence } from './contract.ts'
import { STORY, buildDateParams } from '../synth/story.ts'
import { generate } from '../synth/generate.ts'
import { ssviW } from '../synth/ssvi.ts'

const mk = (dte: number[], frames: number[][][]): Sequence =>
  ({ grid: { k: [-0.1, 0.1], dte }, frames: frames.map((iv, n) => ({ date: `2030-01-0${n + 1}`, iv })) }) as unknown as Sequence

describe('precomputeW', () => {
  it('w = iv^2 * dte / 365 per cell (hand-worked: iv 0.2 at 365d -> 0.04; iv 0.4 at 73d -> 0.032)', () => {
    const wg = precomputeW(mk([73, 365], [[[0.2, 0.4], [0.2, 0.4]]]))
    expect(wg.w[0][0]).toBeCloseTo(0.2 ** 2 * 0.2, 14) // dte 73 = 0.2 y: 0.008
    expect(wg.w[0][1]).toBeCloseTo(0.4 ** 2 * 0.2, 14) // 0.032
    expect(wg.w[0][3]).toBeCloseTo(0.16, 14) // dte 365, iv 0.4
  })
})

describe('interpolateIv: linear in total variance, per cell', () => {
  const seq = mk([73, 365], [
    [[0.2, 0.2], [0.2, 0.2]],
    [[0.4, 0.4], [0.4, 0.4]],
  ])
  const wg = precomputeW(seq)
  it('alpha 0.25 at dte 73 (T = 0.2): w = 0.75 * 0.008 + 0.25 * 0.032 = 0.014, iv = sqrt(0.014 / 0.2) = 0.2645751311', () => {
    const out = makeIvBuffer(2, 2)
    interpolateIv(wg, 0, 1, 0.25, out)
    expect(out[0][0]).toBeCloseTo(0.2645751311, 9)
    // NOT linear in IV: that would be 0.25.
    expect(out[0][0]).not.toBeCloseTo(0.25, 3)
  })
  it('alpha 0.5 at dte 365 (T = 1): w = 0.5 * 0.04 + 0.5 * 0.16 = 0.10, iv = sqrt(0.10) = 0.3162277660', () => {
    const out = makeIvBuffer(2, 2)
    interpolateIv(wg, 0, 1, 0.5, out)
    expect(out[1][1]).toBeCloseTo(0.316227766, 9)
  })
  it('alpha 0 returns frame i exactly, i === j returns frame i exactly, alpha 1 reaches frame j', () => {
    const out = makeIvBuffer(2, 2)
    interpolateIv(wg, 0, 1, 0, out)
    expect(out).toEqual([[0.2, 0.2], [0.2, 0.2]])
    interpolateIv(wg, 1, 1, 0.7, out)
    expect(out).toEqual([[0.4, 0.4], [0.4, 0.4]])
    interpolateIv(wg, 0, 1, 1, out)
    expect(out[0][0]).toBeCloseTo(0.4, 12)
  })
  it('writes into the buffer it is given, returns it, and fully overwrites older contents', () => {
    const out = makeIvBuffer(2, 2)
    const row0 = out[0]
    expect(interpolateIv(wg, 0, 1, 0.5, out)).toBe(out)
    expect(out[0]).toBe(row0)
    const first = out[0][0]
    interpolateIv(wg, 0, 1, 0.1, out)
    expect(out[0][0]).not.toBe(first)
  })
  it('rejects a buffer of the wrong shape and alpha outside [0, 1]', () => {
    expect(() => interpolateIv(wg, 0, 1, 0.5, makeIvBuffer(3, 2))).toThrow(RangeError)
    expect(() => interpolateIv(wg, 0, 1, 1.2, makeIvBuffer(2, 2))).toThrow(RangeError)
    expect(() => interpolateIv(wg, 0, 5, 0.5, makeIvBuffer(2, 2))).toThrow(RangeError)
  })
  it('preserves calendar monotonicity in w: two monotone-in-T frames give a monotone mixture at every alpha', () => {
    const s = mk([30, 90, 365], [
      [[0.3, 0.3], [0.2, 0.2], [0.22, 0.22]],
      [[0.6, 0.6], [0.5, 0.5], [0.4, 0.4]],
    ])
    const g = precomputeW(s)
    const out = makeIvBuffer(3, 2)
    const T = [30 / 365, 90 / 365, 1]
    for (let a = 0; a <= 100; a++) {
      interpolateIv(g, 0, 1, a / 100, out)
      for (let i = 1; i < 3; i++) expect(out[i][0] ** 2 * T[i]).toBeGreaterThan(out[i - 1][0] ** 2 * T[i - 1])
    }
  })
})

describe('interpolateIv against the analytic SSVI mixture (cross-check of the committed grid)', () => {
  it('across the volatility spike (dates 19 -> 20), the grid-based result matches the analytic mixture to within rounding', () => {
    const seq = generate()
    const wg = precomputeW(seq)
    const params = buildDateParams(STORY)
    const out = makeIvBuffer(seq.grid.dte.length, seq.grid.k.length)
    for (const alpha of [0.1, 0.5, 0.9]) {
      interpolateIv(wg, 19, 20, alpha, out)
      let worst = 0
      seq.grid.dte.forEach((d, i) =>
        seq.grid.k.forEach((k, j) => {
          const wa = ssviW(k, { theta: params[19].theta[i], rho: params[19].rho, eta: params[19].eta })
          const wb = ssviW(k, { theta: params[20].theta[i], rho: params[20].rho, eta: params[20].eta })
          const exact = Math.sqrt(((1 - alpha) * wa + alpha * wb) / (d / 365))
          worst = Math.max(worst, Math.abs(out[i][j] - exact))
        }),
      )
      expect(worst, `alpha ${alpha}`).toBeLessThan(2e-6)
    }
  })
})
