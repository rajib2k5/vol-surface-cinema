/**
 * No-arbitrage checks on total-variance slices w(k) with analytic derivatives.
 * A mixture (1 - a) * A + a * B of slices has derivatives that are the same mixture of derivatives,
 * so in-between surfaces are checked exactly, not by finite differences.
 *
 * Pure.
 */
import { ssviSlice, type Slice, type SsviParams } from './ssvi.ts'

/** Gatheral's butterfly density g(k) = (1 - k w'/(2w))^2 - (w'^2/4)(1/w + 1/4) + w''/2. g >= 0 for all k means no butterfly arbitrage. */
export function butterflyG(k: number, s: Slice): number {
  const a = 1 - (k * s.w1) / (2 * s.w)
  return a * a - ((s.w1 * s.w1) / 4) * (1 / s.w + 0.25) + s.w2 / 2
}

export interface SliceArrays {
  w: Float64Array
  w1: Float64Array
  w2: Float64Array
}

/** n evenly spaced points from lo to hi inclusive. The endpoints are exact. */
export function kRange(lo: number, hi: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? hi : lo + ((hi - lo) * i) / (n - 1)))
}

export function sliceArrays(ks: readonly number[], p: SsviParams): SliceArrays {
  const out: SliceArrays = { w: new Float64Array(ks.length), w1: new Float64Array(ks.length), w2: new Float64Array(ks.length) }
  ks.forEach((k, i) => {
    const s = ssviSlice(k, p)
    out.w[i] = s.w
    out.w1[i] = s.w1
    out.w2[i] = s.w2
  })
  return out
}

/** (1 - alpha) * a + alpha * b, array by array. Writes into `out` when given (no allocation). */
export function mixSlices(a: SliceArrays, b: SliceArrays, alpha: number, out?: SliceArrays): SliceArrays {
  const o = out ?? { w: new Float64Array(a.w.length), w1: new Float64Array(a.w.length), w2: new Float64Array(a.w.length) }
  const beta = 1 - alpha
  for (let i = 0; i < a.w.length; i++) {
    o.w[i] = beta * a.w[i] + alpha * b.w[i]
    o.w1[i] = beta * a.w1[i] + alpha * b.w1[i]
    o.w2[i] = beta * a.w2[i] + alpha * b.w2[i]
  }
  return o
}

export function minButterflyG(ks: readonly number[], s: SliceArrays): number {
  let min = Infinity
  for (let i = 0; i < ks.length; i++) {
    const g = butterflyG(ks[i], { w: s.w[i], w1: s.w1[i], w2: s.w2[i] })
    if (g < min) min = g
  }
  return min
}

/** Number of k points where the LATER expiry has less total variance than the earlier one (calendar arbitrage). */
export function calendarViolations(earlier: SliceArrays, later: SliceArrays, tol = 1e-12): number {
  let n = 0
  for (let i = 0; i < earlier.w.length; i++) if (later.w[i] < earlier.w[i] - tol) n++
  return n
}
