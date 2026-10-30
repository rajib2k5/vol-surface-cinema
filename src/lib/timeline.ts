/**
 * The timeline: a pure map from the integer frame index n to which two dates are shown and how far
 * between them. Nothing here reads a clock. See docs/design.md §8 for the normative layout.
 *
 *   Date i is shown at alpha 0 for 1 + h_i frames (phase 'hold'), then F - 1 frames follow with
 *   rawAlpha = m / F, m = 1..F-1 (phase 'transition'). Segment length is h_i + F. No frame with
 *   alpha = 1 is ever emitted, so no keyframe is duplicated.
 */
import type { Easing, Sequence } from './contract.ts'
import { ease } from './easing.ts'

export interface TimelineSpec {
  dates: number
  transitionFrames: number
  holdFrames: readonly number[]
  loop: boolean
  easing: Easing
}

export interface FrameState {
  n: number
  i: number
  /** j = i during a hold; i + 1, or 0 on the wrap, during a transition. */
  j: number
  rawAlpha: number
  alpha: number
  phase: 'hold' | 'transition'
}

interface Layout {
  /** starts[i] = first frame of date i; starts[N] = total. */
  starts: Float64Array
  total: number
}

// Specs are treated as immutable, so the prefix sums are computed once per spec object.
const layouts = new WeakMap<TimelineSpec, Layout>()

function layoutOf(s: TimelineSpec): Layout {
  const cached = layouts.get(s)
  if (cached) return cached
  const N = s.dates
  if (!Number.isInteger(N) || N < 1) throw new RangeError(`timeline needs at least 1 date, got ${N}`)
  if (!Number.isInteger(s.transitionFrames) || s.transitionFrames < 1) throw new RangeError(`transitionFrames must be an integer >= 1, got ${s.transitionFrames}`)
  if (s.holdFrames.length !== N) throw new RangeError(`holdFrames has ${s.holdFrames.length} entries for ${N} dates`)
  for (const h of s.holdFrames) if (!Number.isInteger(h) || h < 0) throw new RangeError(`holdFrames entries must be integers >= 0, got ${h}`)
  const starts = new Float64Array(N + 1)
  const wraps = s.loop && N > 1
  for (let i = 0; i < N; i++) {
    const last = i === N - 1
    starts[i + 1] = starts[i] + (last && !wraps ? 1 + s.holdFrames[i] : s.holdFrames[i] + s.transitionFrames)
  }
  const layout = { starts, total: starts[N] }
  layouts.set(s, layout)
  return layout
}

export function totalFrames(s: TimelineSpec): number {
  return layoutOf(s).total
}

export function startFrameOf(s: TimelineSpec, i: number): number {
  const { starts } = layoutOf(s)
  if (!Number.isInteger(i) || i < 0 || i >= s.dates) throw new RangeError(`date index ${i} is outside [0, ${s.dates})`)
  return starts[i]
}

export function frameAt(s: TimelineSpec, n: number): FrameState {
  const { starts, total } = layoutOf(s)
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`frame index must be an integer >= 0, got ${n}`)
  if (n >= total) n = s.loop ? n % total : total - 1

  // Binary search: the last i with starts[i] <= n.
  let lo = 0
  let hi = s.dates - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= n) lo = mid
    else hi = mid - 1
  }
  const i = lo
  const offset = n - starts[i]
  const h = s.holdFrames[i]
  if (offset <= h) return { n, i, j: i, rawAlpha: 0, alpha: 0, phase: 'hold' }
  const rawAlpha = (offset - h) / s.transitionFrames
  const j = i === s.dates - 1 ? 0 : i + 1
  return { n, i, j, rawAlpha, alpha: ease(s.easing, rawAlpha), phase: 'transition' }
}

/** frameAt(floor(seconds * fps)). The 1e-9 guards against 0.3 * 10 landing a hair under 3. */
export function frameAtTime(s: TimelineSpec, seconds: number, fps: number): FrameState {
  if (!(seconds >= 0)) throw new RangeError(`seconds must be >= 0, got ${seconds}`)
  return frameAt(s, Math.floor(seconds * fps + 1e-9))
}

const EVENT_DEFAULT_HOLD_S = 1.0

export function specFromSequence(seq: Sequence, fps: number): TimelineSpec {
  const pb = seq.playback ?? {}
  const holdS = pb.hold_s ?? 0
  const transitionS = pb.transition_s ?? 0.2
  const index = new Map(seq.frames.map((f, i) => [f.date, i]))
  const holdFrames = seq.frames.map(() => Math.round(holdS * fps))
  for (const e of seq.events) {
    const i = index.get(e.date)
    if (i === undefined) continue
    holdFrames[i] = Math.max(holdFrames[i], Math.round((e.hold_s ?? EVENT_DEFAULT_HOLD_S) * fps))
  }
  return {
    dates: seq.frames.length,
    transitionFrames: Math.max(1, Math.round(transitionS * fps)),
    holdFrames,
    loop: pb.loop ?? true,
    easing: pb.easing ?? 'smoothstep',
  }
}
