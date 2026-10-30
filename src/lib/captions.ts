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
