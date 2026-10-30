import { describe, expect, it } from 'vitest'
import { businessDates, buildDateParams, STORY } from './story.ts'
import { calendarViolations, kRange, minButterflyG, mixSlices, sliceArrays, type SliceArrays } from './arbitrage.ts'
import { ssviRightWingSlope, ssviSlice, type SsviParams } from './ssvi.ts'

describe('businessDates', () => {
  it('starts on 2030-01-02 and skips weekends', () => {
    const d = businessDates('2030-01-02', 6)
    expect(d).toEqual(['2030-01-02', '2030-01-03', '2030-01-04', '2030-01-07', '2030-01-08', '2030-01-09'])
  })
  it('the story has 60 strictly increasing business dates', () => {
    const d = businessDates(STORY.start, STORY.nDates)
    expect(d).toHaveLength(60)
    for (let i = 1; i < d.length; i++) expect(d[i] > d[i - 1]).toBe(true)
    expect(d.every((s) => ![0, 6].includes(new Date(`${s}T00:00:00Z`).getUTCDay()))).toBe(true)
  })
})

const params = buildDateParams(STORY)
const T = STORY.grid.dte.map((d) => d / 365)
const KS = kRange(-1.5, 1.5, 2001)
const at = (p: (typeof params)[number], m: number): SsviParams => ({ theta: p.theta[m], rho: p.rho, eta: p.eta })

describe('buildDateParams', () => {
  it('has one entry per date, theta per grid expiry, rho and eta constant across T', () => {
    expect(params).toHaveLength(60)
    for (const p of params) expect(p.theta).toHaveLength(STORY.grid.dte.length)
  })
  it('is deterministic (same seed -> identical params)', () => {
    expect(buildDateParams(STORY)).toEqual(params)
  })
  it('forward variance is positive, so theta strictly increases in T on every date', () => {
    for (const p of params) for (let m = 1; m < T.length; m++) expect(p.theta[m]).toBeGreaterThan(p.theta[m - 1])
  })
  it('the clamp eta * (1 + |rho|) <= 2 - 1e-3 holds on every date (Gatheral-Jacquier Thm 4.2 sufficient condition)', () => {
    for (const p of params) expect(p.eta * (1 + Math.abs(p.rho))).toBeLessThanOrEqual(2 - 1e-3 + 1e-12)
  })
  it('tells the story: calm, a short-dated spike that inverts the ATM curve, decay, FOMC bump', () => {
    const atmIv = (t: number, m: number) => Math.sqrt(params[t].theta[m] / T[m])
    expect(atmIv(0, 0)).toBeLessThan(atmIv(0, 10)) // calm: upward term structure
    expect(atmIv(20, 0)).toBeGreaterThan(atmIv(20, 10)) // spike: short end above long end (inverted)
    expect(atmIv(20, 0)).toBeGreaterThan(2 * atmIv(19, 0)) // the spike is sudden
    expect(atmIv(45, 0)).toBeLessThan(atmIv(21, 0)) // and decays
    expect(params[20].rho).toBeLessThan(params[19].rho) // skew steepens in the shock
    expect(params[20].eta).toBeGreaterThan(params[19].eta)
    // FOMC event variance: present the day before the meeting, gone on the meeting date.
    const m = STORY.events.find((e) => e.label === 'FOMC decision')!.dateIndex
    expect(params[m - 1].theta[0]).toBeGreaterThan(params[m].theta[0] * 1.1)
  })
})

describe('§5.4 arbitrage checks on the analytic SSVI of the story (k in [-1.5, 1.5], 2001 points, every grid T)', () => {
  it('check 2: butterfly g(k) >= 0 at every date and every expiry', () => {
    for (let t = 0; t < params.length; t++)
      for (let m = 0; m < T.length; m++) {
        const g = minButterflyG(KS, sliceArrays(KS, at(params[t], m)))
        expect(g, `date ${t} T index ${m}`).toBeGreaterThanOrEqual(0)
      }
  })
  it('check 2b: right-wing slope lim w/k < 2 at every date and expiry (Lemma 2.2 also needs d+ -> -inf, which g >= 0 does not give)', () => {
    for (let t = 0; t < params.length; t++)
      for (let m = 0; m < T.length; m++) expect(ssviRightWingSlope(at(params[t], m)), `date ${t} T index ${m}`).toBeLessThan(2)
  })
  it('check 3: calendar w(k, T_{m+1}) >= w(k, T_m) at every date', () => {
    for (let t = 0; t < params.length; t++)
      for (let m = 0; m + 1 < T.length; m++) {
        const lo = sliceArrays(KS, at(params[t], m))
        const hi = sliceArrays(KS, at(params[t], m + 1))
        expect(calendarViolations(lo, hi), `date ${t} T index ${m}`).toBe(0)
      }
  })

  it('check 4: dense interpolation. Every adjacent pair and the wrap pair, 101 alphas: butterfly and calendar hold for the mixture', () => {
    expect(STORY.playback.loop).toBe(true)
    const nT = T.length
    const pairs: [number, number][] = []
    for (let t = 0; t + 1 < params.length; t++) pairs.push([t, t + 1])
    pairs.push([params.length - 1, 0]) // wrap
    let worst = Infinity
    const out: SliceArrays[] = Array.from({ length: nT }, () => sliceArrays(KS, { theta: 1, rho: 0, eta: 1 }))
    for (const [ia, ib] of pairs) {
      const A = Array.from({ length: nT }, (_, m) => sliceArrays(KS, at(params[ia], m)))
      const B = Array.from({ length: nT }, (_, m) => sliceArrays(KS, at(params[ib], m)))
      for (let a = 0; a <= 100; a++) {
        const alpha = a / 100
        for (let m = 0; m < nT; m++) {
          mixSlices(A[m], B[m], alpha, out[m])
          const g = minButterflyG(KS, out[m])
          if (g < worst) worst = g
          expect(g, `pair ${ia}->${ib} alpha ${alpha} T index ${m}`).toBeGreaterThanOrEqual(0)
          if (m > 0) expect(calendarViolations(out[m - 1], out[m]), `calendar pair ${ia}->${ib} alpha ${alpha} T ${m}`).toBe(0)
        }
      }
    }
    expect(Number.isFinite(worst)).toBe(true)
  }, 120_000)
})

describe('§5.4 check 7: known-bad controls prove the checks can fail', () => {
  it('butterfly control: rho = -0.8, eta = 5/1.8 (eta(1+|rho|) = 5), theta = 0.02 has min g < 0', () => {
    const eta = 5 / 1.8
    const g = minButterflyG(KS, sliceArrays(KS, { theta: 0.02, rho: -0.8, eta }))
    expect(g).toBeLessThan(0)
    expect(g).toBeCloseTo(-0.108, 2) // measured in the design review
  })
  it('eta(1+|rho|) = 2.6 is NOT a control: the sufficient condition is violated but g stays positive', () => {
    const eta = 2.6 / 1.8
    expect(minButterflyG(KS, sliceArrays(KS, { theta: 0.02, rho: -0.8, eta }))).toBeGreaterThan(0)
  })
  it('calendar control: a theta that falls between two expiries is flagged', () => {
    const lo = sliceArrays(KS, { theta: 0.06, rho: -0.5, eta: 0.8 })
    const hi = sliceArrays(KS, { theta: 0.05, rho: -0.5, eta: 0.8 }) // theta falls with T
    expect(calendarViolations(lo, hi)).toBeGreaterThan(0)
  })
  it('the dense mixture check can fail: a mixture of a good slice and the bad control slice goes negative somewhere', () => {
    const good = sliceArrays(KS, { theta: 0.02, rho: -0.8, eta: 0.5 })
    const bad = sliceArrays(KS, { theta: 0.02, rho: -0.8, eta: 5 / 1.8 })
    let worst = Infinity
    for (let a = 0; a <= 100; a++) worst = Math.min(worst, minButterflyG(KS, mixSlices(good, bad, a / 100)))
    expect(worst).toBeLessThan(0)
  })
  it('sanity: ssviSlice agrees with sliceArrays at one point', () => {
    const p = at(params[0], 3)
    const s = sliceArrays(KS, p)
    expect(ssviSlice(KS[1000], p).w).toBe(s.w[1000])
  })
})
