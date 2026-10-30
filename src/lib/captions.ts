import type { FrameState } from './timeline.ts'

const DAY_MS = 86_400_000

/**
 * The date text for a frame. Hold: the date. Transition between dates at most gapDays apart: the
 * date nearer in rawAlpha (not eased alpha, so the switch frame is the same for every easing).
 * Further apart: "A → B (interpolated)" for the whole transition.
 */
export function dateCaption(state: FrameState, dates: readonly string[], gapDays = 7): string {
  if (state.phase === 'hold') return dates[state.i]
  const a = dates[state.i]
  const b = dates[state.j]
  const gap = Math.abs(Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS
  if (gap <= gapDays) return state.rawAlpha < 0.5 ? a : b
  return `${a} → ${b} (interpolated)`
}

const pct = (quotedShare: number): string => `${Math.round((1 - quotedShare) * 100)}%`

/**
 * "N% of cells extrapolated", from 1 - quoted_share. Hold: that frame's share. Transition: "A% → B%"
 * (both ends, for the whole transition, because the in-between grid is a mix of the two).
 * null when either end has no quoted_share (the synthetic story has none).
 */
export function extrapolationNote(state: FrameState, quotedShares: readonly (number | undefined)[]): string | null {
  const a = quotedShares[state.i]
  const b = quotedShares[state.j]
  if (a === undefined || b === undefined) return null
  if (state.phase === 'hold') return `${pct(a)} of cells extrapolated`
  return `${pct(a)} → ${pct(b)} of cells extrapolated`
}
