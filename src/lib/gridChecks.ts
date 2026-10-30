/**
 * No-arbitrage checks on a discrete [dte][k] IV grid (the real frames have no model parameters, so the
 * analytic checks of src/synth cannot run on them). Report-only: nothing here repairs a grid.
 *
 *   calendar:  total variance w = iv^2 * dte/365 must not fall with expiry, column by column.
 *   butterfly: Gatheral's density g(k) = (1 - k w'/(2w))^2 - (w'^2/4)(1/w + 1/4) + w''/2 must be >= 0.
 *              w' and w'' come from three-point finite differences on the (possibly uneven) k grid,
 *              so g is only defined at the interior strikes, and on a coarse noisy grid it is a
 *              screen, not a proof.
 *
 * Pure.
 */
import { butterflyG } from '../synth/arbitrage.ts'

export interface CalendarCheck {
  /** Column pairs (adjacent expiries) examined. */
  cells: number
  violations: number
  /** Most negative w(T_next) - w(T), or 0 when there is none. */
  worst: number
}

export interface ButterflyCheck {
  /** Interior strikes examined, over every expiry. */
  cells: number
  violations: number
  /** Smallest g found. */
  min: number
}

function checkShape(iv: readonly (readonly number[])[], k: readonly number[], dte: readonly number[]): void {
  if (iv.length !== dte.length || iv.some((r) => r.length !== k.length)) throw new RangeError(`iv must be ${dte.length} x ${k.length} ([dte][k])`)
}

const w = (iv: number, d: number): number => iv * iv * (d / 365)

export function calendarGridCheck(iv: readonly (readonly number[])[], dte: readonly number[], tol = 1e-12): CalendarCheck {
  checkShape(iv, iv[0] ?? [], dte)
  let cells = 0
  let violations = 0
  let worst = 0
  for (let i = 0; i + 1 < dte.length; i++)
    for (let j = 0; j < iv[i].length; j++) {
      cells++
      const diff = w(iv[i + 1][j], dte[i + 1]) - w(iv[i][j], dte[i])
      if (diff < -tol) violations++
      if (diff < worst) worst = diff
    }
  return { cells, violations, worst }
}

export function butterflyGridCheck(iv: readonly (readonly number[])[], k: readonly number[], dte: readonly number[]): ButterflyCheck {
  checkShape(iv, k, dte)
  if (k.length < 3) throw new RangeError('the butterfly check needs at least 3 strikes')
  let cells = 0
  let violations = 0
  let min = Infinity
  for (let i = 0; i < dte.length; i++) {
    const ws = iv[i].map((v) => w(v, dte[i]))
    for (let j = 1; j + 1 < k.length; j++) {
      const hl = k[j] - k[j - 1]
      const hr = k[j + 1] - k[j]
      // Three-point derivative formulas for uneven spacing (exact for a quadratic).
      const w1 = (-hr / (hl * (hl + hr))) * ws[j - 1] + ((hr - hl) / (hl * hr)) * ws[j] + (hl / (hr * (hl + hr))) * ws[j + 1]
      const w2 = (2 / (hl * (hl + hr))) * ws[j - 1] - (2 / (hl * hr)) * ws[j] + (2 / (hr * (hl + hr))) * ws[j + 1]
      const g = butterflyG(k[j], { w: ws[j], w1, w2 })
      cells++
      if (g < 0) violations++
      if (g < min) min = g
    }
  }
  return { cells, violations, min }
}
