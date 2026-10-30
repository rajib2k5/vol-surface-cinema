/** Event annotation windows, in frames. Opacity is a function of n only: never a CSS transition. */
import type { Sequence } from './contract.ts'
import { startFrameOf, totalFrames, type TimelineSpec } from './timeline.ts'

export const FADE_FRAMES = 6

export interface EventWindow {
  dateIndex: number
  beforeFrames: number
  afterFrames: number
}

export interface ActiveEvent {
  index: number
  opacity: number
}

/**
 * An event is active when start - before <= n < start + 1 + h_i + after, clamped to [0, total).
 * Windows do not wrap. Opacity ramps linearly over FADE_FRAMES at each edge of the unclamped window,
 * so an edge cut off by the start of the timeline does not fade.
 */
export function activeEvents(s: TimelineSpec, events: readonly EventWindow[], n: number): ActiveEvent[] {
  const total = totalFrames(s)
  const out: ActiveEvent[] = []
  events.forEach((e, index) => {
    const start = startFrameOf(s, e.dateIndex)
    const winStart = start - e.beforeFrames
    const winEnd = start + 1 + s.holdFrames[e.dateIndex] + e.afterFrames
    if (n < Math.max(0, winStart) || n >= Math.min(total, winEnd)) return
    const rise = (n - winStart + 1) / FADE_FRAMES
    const fall = (winEnd - n) / FADE_FRAMES
    out.push({ index, opacity: Math.min(1, rise, fall) })
  })
  return out
}

export interface SequenceEvent extends EventWindow {
  label: string
  kind?: string
}

const BEFORE_S = 0.5
const AFTER_S = 1.5

export function eventsFromSequence(seq: Sequence, fps: number): SequenceEvent[] {
  const index = new Map(seq.frames.map((f, i) => [f.date, i]))
  return seq.events.flatMap((e) => {
    const dateIndex = index.get(e.date)
    if (dateIndex === undefined) return []
    return [
      {
        dateIndex,
        beforeFrames: Math.round((e.show_before_s ?? BEFORE_S) * fps),
        afterFrames: Math.round((e.show_after_s ?? AFTER_S) * fps),
        label: e.label,
        kind: e.kind,
      },
    ]
  })
}
