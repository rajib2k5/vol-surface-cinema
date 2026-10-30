/**
 * Interpolation between two dates: linear in total variance w = iv^2 * dte / 365, per cell, then
 * back to IV by iv = sqrt(w / T). This preserves calendar monotonicity (a convex combination of
 * functions that increase in T increases in T); lerping IV would not. See docs/design.md §5.3.
 *
 * w grids are precomputed at load. interpolateIv writes into a caller-owned buffer, so playing
 * allocates nothing per frame.
 */
import type { Sequence } from './contract.ts'

export interface WGrids {
  nT: number
  nK: number
  /** Per frame, row-major [dte][k], flattened: w = iv^2 * T. */
  w: Float64Array[]
  /** Per frame, the original IV grid, returned unchanged on hold frames. */
  iv: (readonly (readonly number[])[])[]
  /** T = dte / 365 per row. */
  T: Float64Array
}

export function precomputeW(seq: Sequence): WGrids {
  const nT = seq.grid.dte.length
  const nK = seq.grid.k.length
  const T = Float64Array.from(seq.grid.dte, (d) => d / 365)
  const w = seq.frames.map((f) => {
    const out = new Float64Array(nT * nK)
    for (let i = 0; i < nT; i++) for (let j = 0; j < nK; j++) out[i * nK + j] = f.iv[i][j] ** 2 * T[i]
    return out
  })
  return { nT, nK, w, iv: seq.frames.map((f) => f.iv), T }
}

/** A reusable [dte][k] output buffer. */
export function makeIvBuffer(nT: number, nK: number): number[][] {
  return Array.from({ length: nT }, () => new Array<number>(nK).fill(0))
}

/** Fill `out` with the IV grid at fraction alpha between frames i and j. Returns `out`. */
export function interpolateIv(wg: WGrids, i: number, j: number, alpha: number, out: number[][]): number[][] {
  if (!(i >= 0 && i < wg.w.length && j >= 0 && j < wg.w.length)) throw new RangeError(`frame index out of range: ${i}, ${j}`)
  if (!(alpha >= 0 && alpha <= 1)) throw new RangeError(`alpha must be in [0, 1], got ${alpha}`)
  if (out.length !== wg.nT || out.some((row) => row.length !== wg.nK)) throw new RangeError(`output buffer must be ${wg.nT} x ${wg.nK}`)
  const { nT, nK, T } = wg
  if (i === j || alpha === 0) {
    const src = wg.iv[i]
    for (let r = 0; r < nT; r++) for (let c = 0; c < nK; c++) out[r][c] = src[r][c]
    return out
  }
  const a = wg.w[i]
  const b = wg.w[j]
  const beta = 1 - alpha
  for (let r = 0; r < nT; r++) {
    const row = out[r]
    for (let c = 0; c < nK; c++) {
      const k = r * nK + c
      row[c] = Math.sqrt((beta * a[k] + alpha * b[k]) / T[r])
    }
  }
  return out
}
