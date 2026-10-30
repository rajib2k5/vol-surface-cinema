import { describe, expect, it } from 'vitest'
import { frameAt, frameAtTime, specFromSequence, startFrameOf, totalFrames, type TimelineSpec } from './timeline.ts'
import { ease } from './easing.ts'
import type { Sequence } from './contract.ts'

const spec = (over: Partial<TimelineSpec> & { dates: number }): TimelineSpec => ({
  transitionFrames: 4,
  holdFrames: Array.from({ length: over.dates }, () => 0),
  loop: false,
  easing: 'linear',
  ...over,
})

describe('totalFrames (hand-worked from the layout in the design)', () => {
  it('N = 1 is a static sequence of 1 + h0 frames, with or without loop', () => {
    expect(totalFrames(spec({ dates: 1, holdFrames: [0] }))).toBe(1)
    expect(totalFrames(spec({ dates: 1, holdFrames: [3], loop: true }))).toBe(4)
  })
  it('N = 2, F = 4, no hold: no loop = (0 + 4) + (1 + 0) = 5; loop = 4 + 4 = 8', () => {
    expect(totalFrames(spec({ dates: 2 }))).toBe(5)
    expect(totalFrames(spec({ dates: 2, loop: true }))).toBe(8)
  })
  it('N = 5, F = 4: no loop = 4 * 4 + 1 = 17; loop = 5 * 4 = 20', () => {
    expect(totalFrames(spec({ dates: 5 }))).toBe(17)
    expect(totalFrames(spec({ dates: 5, loop: true }))).toBe(20)
  })
  it('holds add to their own segment: N = 3, F = 2, h = [1, 0, 2], no loop = (1+2) + (0+2) + (1+2) = 8; loop = 3 + 2 + 4 = 9', () => {
    expect(totalFrames(spec({ dates: 3, transitionFrames: 2, holdFrames: [1, 0, 2] }))).toBe(8)
    expect(totalFrames(spec({ dates: 3, transitionFrames: 2, holdFrames: [1, 0, 2], loop: true }))).toBe(9)
  })
  it('F = 1 is a jump cut: N = 3 no loop = 3 frames, all holds', () => {
    const s = spec({ dates: 3, transitionFrames: 1 })
    expect(totalFrames(s)).toBe(3)
    for (let n = 0; n < 3; n++) expect(frameAt(s, n)).toMatchObject({ i: n, j: n, rawAlpha: 0, phase: 'hold' })
  })
  it('N = 0 is a RangeError, and so is F < 1 or non-integer, or a holdFrames length mismatch', () => {
    expect(() => totalFrames(spec({ dates: 0, holdFrames: [] }))).toThrow(RangeError)
    expect(() => totalFrames(spec({ dates: 2, transitionFrames: 0 }))).toThrow(RangeError)
    expect(() => totalFrames(spec({ dates: 2, transitionFrames: 1.5 }))).toThrow(RangeError)
    expect(() => totalFrames(spec({ dates: 2, holdFrames: [0] }))).toThrow(RangeError)
    expect(() => totalFrames(spec({ dates: 2, holdFrames: [0, -1] }))).toThrow(RangeError)
  })
})

describe('frameAt: layout (hand-worked)', () => {
  // N = 3, F = 4, h = [1, 0, 2], loop. Segments: date 0: frames 0..4 (len 5): hold 0,1 then t 2,3,4.
  //   date 1: frames 5..8 (len 4): hold 5 then t 6,7,8.   date 2: frames 9..14 (len 6): hold 9,10,11 then t 12,13,14 (wrap to 0).
  const s = spec({ dates: 3, holdFrames: [1, 0, 2], loop: true })
  it('total is 15 and segments start at 0, 5, 9', () => {
    expect(totalFrames(s)).toBe(15)
    expect([0, 1, 2].map((i) => startFrameOf(s, i))).toEqual([0, 5, 9])
  })
  it('the first segment: two holds, then transition frames with rawAlpha 1/4, 2/4, 3/4 toward date 1', () => {
    expect(frameAt(s, 0)).toEqual({ n: 0, i: 0, j: 0, rawAlpha: 0, alpha: 0, phase: 'hold' })
    expect(frameAt(s, 1)).toEqual({ n: 1, i: 0, j: 0, rawAlpha: 0, alpha: 0, phase: 'hold' })
    expect(frameAt(s, 2)).toEqual({ n: 2, i: 0, j: 1, rawAlpha: 0.25, alpha: 0.25, phase: 'transition' })
    expect(frameAt(s, 3)).toMatchObject({ i: 0, j: 1, rawAlpha: 0.5 })
    expect(frameAt(s, 4)).toMatchObject({ i: 0, j: 1, rawAlpha: 0.75 })
  })
  it('date 1 starts exactly at frame 5 as a hold at alpha 0 (no frame ever has alpha 1)', () => {
    expect(frameAt(s, 5)).toMatchObject({ i: 1, j: 1, rawAlpha: 0, phase: 'hold' })
  })
  it('the last segment wraps: its transition frames go to date 0', () => {
    expect(frameAt(s, 12)).toMatchObject({ i: 2, j: 0, rawAlpha: 0.25, phase: 'transition' })
    expect(frameAt(s, 14)).toMatchObject({ i: 2, j: 0, rawAlpha: 0.75, phase: 'transition' })
  })
  it('without loop the last date is only holds and the sequence ends on it', () => {
    const nl = spec({ dates: 3, holdFrames: [1, 0, 2], loop: false })
    expect(totalFrames(nl)).toBe(5 + 4 + 3)
    expect(frameAt(nl, 11)).toMatchObject({ i: 2, j: 2, phase: 'hold' })
    expect(frameAt(nl, 9)).toMatchObject({ i: 2, j: 2, phase: 'hold' })
  })
  it('alpha is ease(kind, rawAlpha)', () => {
    const e = spec({ dates: 2, transitionFrames: 4, easing: 'smoothstep' })
    const st = frameAt(e, 1)
    expect(st.rawAlpha).toBe(0.25)
    expect(st.alpha).toBe(ease('smoothstep', 0.25))
    expect(st.alpha).toBeCloseTo(0.15625, 12)
  })
})

describe('frameAt: invariants', () => {
  const cases: [string, TimelineSpec][] = [
    ['5 dates, F 6, loop', spec({ dates: 5, transitionFrames: 6, holdFrames: [0, 3, 0, 0, 7], loop: true })],
    ['5 dates, F 6, no loop', spec({ dates: 5, transitionFrames: 6, holdFrames: [0, 3, 0, 0, 7] })],
    ['2 dates, F 2', spec({ dates: 2, transitionFrames: 2 })],
  ]
  it.each(cases)('%s: every transition frame maps to a unique (i, j, rawAlpha); hold frames of date i all map to (i, i, 0)', (_n, s) => {
    const seen = new Set<string>()
    const holds = new Map<number, number>()
    for (let n = 0; n < totalFrames(s); n++) {
      const f = frameAt(s, n)
      if (f.phase === 'transition') {
        const key = `${f.i}|${f.j}|${f.rawAlpha}`
        expect(seen.has(key), `duplicate transition key ${key}`).toBe(false)
        seen.add(key)
        expect(f.rawAlpha).toBeGreaterThan(0)
        expect(f.rawAlpha).toBeLessThan(1)
      } else {
        expect(f.j).toBe(f.i)
        expect(f.rawAlpha).toBe(0)
        holds.set(f.i, (holds.get(f.i) ?? 0) + 1)
      }
    }
    // Event holds lengthen exactly their own date: date i shows for 1 + h_i hold frames.
    s.holdFrames.forEach((h, i) => expect(holds.get(i), `hold frames of date ${i}`).toBe(1 + h))
  })
  it.each(cases)('%s: (i, rawAlpha) never goes backwards apart from the wrap', (_n, s) => {
    let prev = frameAt(s, 0)
    for (let n = 1; n < totalFrames(s); n++) {
      const f = frameAt(s, n)
      const forward = f.i > prev.i || (f.i === prev.i && f.rawAlpha >= prev.rawAlpha)
      expect(forward, `frame ${n}`).toBe(true)
      prev = f
    }
  })
  it('n field reports the frame actually shown', () => {
    const s = spec({ dates: 3, loop: true })
    expect(frameAt(s, 7).n).toBe(7)
  })
})

describe('frameAt: arguments', () => {
  it('a negative or non-integer n always throws RangeError, even when looping', () => {
    for (const loop of [true, false]) {
      const s = spec({ dates: 3, loop })
      expect(() => frameAt(s, -1)).toThrow(RangeError)
      expect(() => frameAt(s, 1.5)).toThrow(RangeError)
      expect(() => frameAt(s, NaN)).toThrow(RangeError)
      expect(() => frameAt(s, Infinity)).toThrow(RangeError)
    }
  })
  it('with loop, frameAt(total) equals frameAt(0) and frame total - 1 is on the wrap transition', () => {
    const s = spec({ dates: 4, transitionFrames: 6, holdFrames: [0, 2, 0, 0], loop: true })
    const total = totalFrames(s)
    expect(frameAt(s, total)).toEqual(frameAt(s, 0))
    expect(frameAt(s, total + 5)).toEqual(frameAt(s, 5))
    expect(frameAt(s, 3 * total + 2)).toEqual(frameAt(s, 2))
    const last = frameAt(s, total - 1)
    expect(last).toMatchObject({ i: 3, j: 0, phase: 'transition' })
    expect(last.rawAlpha).toBeCloseTo(5 / 6, 12)
  })
  it('without loop, n >= total clamps to the last frame', () => {
    const s = spec({ dates: 3 })
    const last = frameAt(s, totalFrames(s) - 1)
    expect(frameAt(s, totalFrames(s))).toEqual(last)
    expect(frameAt(s, 10_000)).toEqual(last)
  })
  it('a single date with loop never interpolates (no wrap for N = 1)', () => {
    const s = spec({ dates: 1, holdFrames: [2], loop: true })
    for (let n = 0; n < 3; n++) expect(frameAt(s, n)).toMatchObject({ i: 0, j: 0, phase: 'hold' })
    expect(frameAt(s, 3)).toEqual(frameAt(s, 0)) // loops over its 3 frames
  })
})

describe('startFrameOf', () => {
  it('rejects an index outside [0, N)', () => {
    const s = spec({ dates: 3 })
    expect(() => startFrameOf(s, -1)).toThrow(RangeError)
    expect(() => startFrameOf(s, 3)).toThrow(RangeError)
    expect(() => startFrameOf(s, 0.5)).toThrow(RangeError)
  })
  it('frameAt(startFrameOf(i)) is date i at alpha 0 for every i', () => {
    const s = spec({ dates: 6, holdFrames: [0, 1, 0, 4, 0, 0], loop: true })
    for (let i = 0; i < 6; i++) expect(frameAt(s, startFrameOf(s, i))).toMatchObject({ i, j: i, rawAlpha: 0, phase: 'hold' })
  })
})

describe('frameAtTime', () => {
  const s = spec({ dates: 5, transitionFrames: 6, loop: true })
  it('equals frameAt(floor(t * fps))', () => {
    for (const t of [0, 0.01, 0.1, 0.5, 1, 1.234, 2.999]) expect(frameAtTime(s, t, 30)).toEqual(frameAt(s, Math.floor(t * 30)))
  })
  it('does not lose a frame to floating point: 0.3 s at 10 fps is frame 3', () => {
    expect(0.3 * 10).toBeLessThan(3.0000000001) // 3.0000000000000004 or 3, either way
    expect(frameAtTime(s, 0.3, 10).n).toBe(3)
    expect(frameAtTime(s, 0.7, 10).n).toBe(7) // 0.7 * 10 = 7.000000000000001, 0.29 * 100 = 28.999999999999996 elsewhere
    expect(frameAtTime(s, 0.29, 100).n).toBe(29)
  })
  it('a negative time throws RangeError', () => {
    expect(() => frameAtTime(s, -0.001, 30)).toThrow(RangeError)
  })
})

describe('performance', () => {
  it('10 000 calls of frameAt on a 10 000-date timeline take < 50 ms', () => {
    const N = 10_000
    const big = spec({ dates: N, transitionFrames: 6, loop: true })
    totalFrames(big)
    const total = totalFrames(big)
    const t0 = performance.now()
    let acc = 0
    for (let k = 0; k < 10_000; k++) acc += frameAt(big, (k * 7919) % total).i
    const ms = performance.now() - t0
    expect(acc).toBeGreaterThan(0)
    expect(ms).toBeLessThan(50)
  })
})

describe('specFromSequence', () => {
  const seq = (over: Partial<Sequence>): Sequence =>
    ({
      frames: ['2030-01-02', '2030-01-03', '2030-01-04'].map((date) => ({ date, iv: [] })),
      events: [],
      ...over,
    }) as unknown as Sequence

  it('applies the defaults: hold 0, transition 0.2 s, smoothstep, loop true', () => {
    expect(specFromSequence(seq({}), 30)).toEqual({ dates: 3, transitionFrames: 6, holdFrames: [0, 0, 0], loop: true, easing: 'smoothstep' })
  })
  it('F = max(1, round(transition_s * fps)); transition_s 0 is a jump cut', () => {
    expect(specFromSequence(seq({ playback: { transition_s: 2 } }), 30).transitionFrames).toBe(60)
    expect(specFromSequence(seq({ playback: { transition_s: 0 } }), 30).transitionFrames).toBe(1)
    expect(specFromSequence(seq({ playback: { transition_s: 0.2 } }), 10).transitionFrames).toBe(2)
  })
  it('hold_s applies to every date; an event hold raises (never lowers) its own date to max', () => {
    const s = seq({
      playback: { hold_s: 0.5 },
      events: [
        { date: '2030-01-03', label: 'a', hold_s: 2 },
        { date: '2030-01-04', label: 'b', hold_s: 0.1 },
      ],
    })
    expect(specFromSequence(s, 10).holdFrames).toEqual([5, 20, 5])
  })
  it('an event without hold_s defaults to 1.0 s', () => {
    expect(specFromSequence(seq({ events: [{ date: '2030-01-03', label: 'a' }] }), 30).holdFrames).toEqual([0, 30, 0])
  })
  it('two events on one date: the longest hold wins', () => {
    const s = seq({ events: [{ date: '2030-01-02', label: 'a', hold_s: 1 }, { date: '2030-01-02', label: 'b', hold_s: 3 }] })
    expect(specFromSequence(s, 10).holdFrames).toEqual([30, 0, 0])
  })
  it('playback loop false and easing are carried over', () => {
    const sp = specFromSequence(seq({ playback: { loop: false, easing: 'easeInOutCubic' } }), 30)
    expect(sp.loop).toBe(false)
    expect(sp.easing).toBe('easeInOutCubic')
  })
  it('the committed default story plays 450 frames at 30 fps (59 * 6 + 6 + 3 * 30), as costed in the design', async () => {
    const { generate } = await import('../synth/generate.ts')
    const sp = specFromSequence(generate(), 30)
    expect(totalFrames(sp)).toBe(450)
  })
})
