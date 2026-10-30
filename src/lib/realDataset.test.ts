import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dateCaption, extrapolationNote } from './captions.ts'
import { parseSequence, type Sequence } from './contract.ts'
import { activeEvents, eventsFromSequence } from './events.ts'
import { calendarGridCheck } from './gridChecks.ts'
import { interpolateIv, makeIvBuffer, precomputeW } from './interpolate.ts'
import { frameAt, specFromSequence, startFrameOf, totalFrames } from './timeline.ts'

// The real dataset is 4 dates years apart. The timeline and the captions must say, in words, that
// everything between two dates is interpolated and not observed.
const parsed = parseSequence(JSON.parse(readFileSync(new URL('../../public/data/optionsdx-spy-4dates.json', import.meta.url), 'utf8')))
if (!parsed.ok) throw new Error('committed dataset is invalid')
const seq: Sequence = parsed.value
const spec = specFromSequence(seq, 30)
const total = totalFrames(spec)
const dates = seq.frames.map((f) => f.date)
const shares = seq.frames.map((f) => f.quoted_share)

describe('the real dataset on the timeline', () => {
  it('plays hold 1 s + transition 2 s per date, once: 301 frames at 30 fps', () => {
    expect(spec.loop).toBe(false)
    expect(spec.holdFrames).toEqual([30, 30, 30, 30])
    expect(spec.transitionFrames).toBe(60)
    expect(total).toBe(3 * (30 + 60) + 1 + 30)
  })
  it('hold frames show the plain date; every transition frame says "(interpolated)" with both dates', () => {
    for (let n = 0; n < total; n++) {
      const st = frameAt(spec, n)
      const caption = dateCaption(st, dates)
      if (st.phase === 'hold') expect(caption).toBe(dates[st.i])
      else expect(caption).toBe(`${dates[st.i]} → ${dates[st.j]} (interpolated)`)
    }
    expect(dateCaption(frameAt(spec, startFrameOf(spec, 1) - 5), dates)).toBe('2017-11-03 → 2018-02-05 (interpolated)')
  })
  it('the extrapolated-share note is on every frame, from 1 - quoted_share', () => {
    expect(extrapolationNote(frameAt(spec, 0), shares)).toBe('35% of cells extrapolated')
    expect(extrapolationNote(frameAt(spec, startFrameOf(spec, 1) - 5), shares)).toBe('35% → 34% of cells extrapolated')
    expect(extrapolationNote(frameAt(spec, startFrameOf(spec, 2)), shares)).toBe('1% of cells extrapolated')
    for (let n = 0; n < total; n++) expect(extrapolationNote(frameAt(spec, n), shares)).toMatch(/of cells extrapolated$/)
  })
  it('each event window sits inside the timeline and its pill is visible on its own date', () => {
    const events = eventsFromSequence(seq, 30)
    expect(events.map((e) => e.label)).toEqual(['February 2018 volatility spike', 'March 2020 crash', 'Mid-2023'])
    for (const e of events) {
      const at = startFrameOf(spec, e.dateIndex)
      const idx = events.indexOf(e)
      expect(activeEvents(spec, events, at).some((a) => a.index === idx && a.opacity > 0)).toBe(true)
    }
  })
  it('in-between frames stay calendar-monotone: 0 violations on all 3 pairs x 101 alphas', () => {
    const wg = precomputeW(seq)
    const buf = makeIvBuffer(wg.nT, wg.nK)
    let bad = 0
    for (let i = 0; i + 1 < seq.frames.length; i++)
      for (let a = 0; a <= 100; a++) {
        interpolateIv(wg, i, i + 1, a / 100, buf)
        bad += calendarGridCheck(buf, seq.grid.dte).violations
      }
    expect(bad).toBe(0)
  })
})
