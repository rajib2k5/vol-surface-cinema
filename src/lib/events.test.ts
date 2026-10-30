import { describe, expect, it } from 'vitest'
import { activeEvents, eventsFromSequence, FADE_FRAMES, type EventWindow } from './events.ts'
import { frameAt, totalFrames, startFrameOf, type TimelineSpec } from './timeline.ts'
import type { Sequence } from './contract.ts'

// 10 dates, F = 4, event hold on date 5 of 6 frames -> segment lengths 4 except date 5 = 10. loop true: total = 9 * 4 + 10 = 46.
const spec: TimelineSpec = {
  dates: 10,
  transitionFrames: 4,
  holdFrames: [0, 0, 0, 0, 0, 6, 0, 0, 0, 0],
  loop: true,
  easing: 'linear',
}
const start5 = startFrameOf(spec, 5) // 20
const ev = (over: Partial<EventWindow> = {}): EventWindow => ({ dateIndex: 5, beforeFrames: 10, afterFrames: 12, ...over })

describe('activeEvents: window', () => {
  it('constants: the fade is 6 frames', () => expect(FADE_FRAMES).toBe(6))
  it('is active for start - before <= n < start + 1 + hold + after, i.e. [10, 39)', () => {
    expect(start5).toBe(20)
    const active = (n: number) => activeEvents(spec, [ev()], n).length === 1
    expect(active(9)).toBe(false)
    expect(active(10)).toBe(true)
    expect(active(38)).toBe(true)
    expect(active(39)).toBe(false)
  })
  it('clamps to [0, total): an event near frame 0 starts at frame 0, with no wrap-around window', () => {
    const early = ev({ dateIndex: 0, beforeFrames: 15, afterFrames: 4 })
    expect(activeEvents(spec, [early], 0)).toHaveLength(1)
    expect(activeEvents(spec, [early], 4)).toHaveLength(1) // window [-15, 0 + 1 + 0 + 4) = [-15, 5)
    expect(activeEvents(spec, [early], 5)).toHaveLength(0)
    const late = ev({ dateIndex: 9, beforeFrames: 2, afterFrames: 40 })
    const total = totalFrames(spec)
    expect(activeEvents(spec, [late], total - 1)).toHaveLength(1)
    expect(activeEvents(spec, [late], 0)).toHaveLength(0) // does not wrap to the start
  })
  it('returns the index of each active event, in input order', () => {
    const a = ev({ dateIndex: 5 })
    const b = ev({ dateIndex: 6, beforeFrames: 3, afterFrames: 3 })
    const got = activeEvents(spec, [a, b], 33)
    expect(got.map((g) => g.index)).toEqual([0, 1])
  })
})

describe('activeEvents: opacity ramps linearly over 6 frames at each edge, as a function of n only', () => {
  const op = (n: number) => activeEvents(spec, [ev()], n)[0]?.opacity ?? 0
  it('rises 1/6, 2/6, ... 6/6 over the first 6 frames of the window and then holds at 1', () => {
    for (let k = 0; k < 6; k++) expect(op(10 + k)).toBeCloseTo((k + 1) / 6, 12)
    expect(op(16)).toBe(1)
    expect(op(25)).toBe(1)
  })
  it('falls over the last 6 frames: the last active frame (38) is 1/6', () => {
    expect(op(38)).toBeCloseTo(1 / 6, 12)
    expect(op(33)).toBeCloseTo(6 / 6, 12)
    expect(op(34)).toBeCloseTo(5 / 6, 12)
  })
  it('a window shorter than the two ramps never exceeds the smaller ramp', () => {
    const tiny = ev({ beforeFrames: 2, afterFrames: 0 }) // window [18, 20 + 1 + 6 + 0) = [18, 27)  -> 9 frames
    const o = (n: number) => activeEvents(spec, [tiny], n)[0].opacity
    expect(o(18)).toBeCloseTo(1 / 6, 12)
    expect(o(22)).toBeCloseTo(5 / 6, 12) // rise (22 - 18 + 1) / 6 and fall (27 - 22) / 6 are both 5/6: the peak is below 1
    expect(o(26)).toBeCloseTo(1 / 6, 12)
    for (let n = 18; n < 27; n++) expect(o(n)).toBeLessThan(1)
  })
  it('does not fade at an edge that was clamped to the start of the timeline', () => {
    const early = ev({ dateIndex: 0, beforeFrames: 15, afterFrames: 20 })
    expect(activeEvents(spec, [early], 0)[0].opacity).toBe(1)
  })
  it('is deterministic: the same n gives the same opacity regardless of call order', () => {
    const a = op(12)
    op(30)
    op(11)
    expect(op(12)).toBe(a)
  })
  it('stays inside [0, 1] for every frame', () => {
    for (let n = 0; n < totalFrames(spec); n++) for (const g of activeEvents(spec, [ev()], n)) {
      expect(g.opacity).toBeGreaterThan(0)
      expect(g.opacity).toBeLessThanOrEqual(1)
    }
  })
  it('the event is fully visible while its date is showing (hold frames) given default show windows', () => {
    for (let n = start5; n < start5 + 1 + 6; n++) {
      expect(frameAt(spec, n)).toMatchObject({ i: 5, phase: 'hold' })
      expect(activeEvents(spec, [ev({ beforeFrames: 15, afterFrames: 45 })], n)[0].opacity).toBe(1)
    }
  })
})

describe('eventsFromSequence', () => {
  const seq = {
    frames: ['2030-01-02', '2030-01-03', '2030-01-04'].map((date) => ({ date })),
    events: [
      { date: '2030-01-03', label: 'Spike', kind: 'shock' },
      { date: '2030-01-04', label: 'Custom', show_before_s: 1, show_after_s: 2 },
    ],
  } as unknown as Sequence
  it('maps dates to indices, applies defaults 0.5 s before and 1.5 s after, and converts seconds to frames', () => {
    const out = eventsFromSequence(seq, 30)
    expect(out[0]).toEqual({ dateIndex: 1, beforeFrames: 15, afterFrames: 45, label: 'Spike', kind: 'shock' })
    expect(out[1]).toMatchObject({ dateIndex: 2, beforeFrames: 30, afterFrames: 60, label: 'Custom' })
  })
})
