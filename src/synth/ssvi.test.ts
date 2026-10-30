import { describe, expect, it } from 'vitest'
import { phi, ssviSlice, ssviW } from './ssvi.ts'

describe('ssviW: hand-worked values', () => {
  it('at k = 0, w equals theta for any rho and eta', () => {
    expect(ssviW(0, { theta: 0.04, rho: -0.7, eta: 0.9 })).toBeCloseTo(0.04, 14)
    expect(ssviW(0, { theta: 1.3, rho: 0.2, eta: 2 })).toBeCloseTo(1.3, 14)
  })
  it('rho = 0, eta = 1, theta = 1, k = 1: phi = 1/sqrt(2), w = (1 + sqrt(1.5)) / 2', () => {
    expect(phi(1, 1)).toBeCloseTo(Math.SQRT1_2, 14)
    expect(ssviW(1, { theta: 1, rho: 0, eta: 1 })).toBeCloseTo((1 + Math.sqrt(1.5)) / 2, 12) // 1.1123724357
  })
  it('rho = -0.5: w(1) = 0.7684460632 and the smile is skewed (put wing above call wing)', () => {
    const p = { theta: 1, rho: -0.5, eta: 1 }
    expect(ssviW(1, p)).toBeCloseTo(0.7684460632, 9)
    expect(ssviW(-1, p)).toBeGreaterThan(ssviW(1, p))
  })
  it('phi follows eta * theta^-1/2 * (1+theta)^-1/2', () => {
    expect(phi(0.04, 0.9)).toBeCloseTo((0.9 / Math.sqrt(0.04)) / Math.sqrt(1.04), 14)
  })
})

describe('ssviSlice: analytic derivatives', () => {
  const cases = [
    { theta: 0.02, rho: -0.8, eta: 1.0 },
    { theta: 0.3, rho: -0.3, eta: 0.6 },
    { theta: 1.0, rho: 0.4, eta: 1.2 },
    { theta: 0.05, rho: 0, eta: 0.8 },
  ]
  it.each(cases)('w, w\' and w\'\' match central differences to 1e-6 at theta=$theta rho=$rho', (p) => {
    for (const k of [-1.2, -0.4, -0.05, 0, 0.1, 0.7, 1.4]) {
      const h = 1e-4
      const s = ssviSlice(k, p)
      const wp = ssviW(k + h, p)
      const wm = ssviW(k - h, p)
      expect(s.w, `w at k=${k}`).toBeCloseTo(ssviW(k, p), 12)
      expect(s.w1, `w' at k=${k}`).toBeCloseTo((wp - wm) / (2 * h), 6)
      expect(s.w2, `w'' at k=${k}`).toBeCloseTo((wp - 2 * ssviW(k, p) + wm) / (h * h), 6)
    }
  })
  it('hand-worked w\' and w\'\' at rho = -0.5, eta = 1, theta = 1, k = 1', () => {
    const s = ssviSlice(1, { theta: 1, rho: -0.5, eta: 1 })
    expect(s.w1).toBeCloseTo(-0.0945444831, 9)
    expect(s.w2).toBeCloseTo(0.2655701242, 9)
  })
})
