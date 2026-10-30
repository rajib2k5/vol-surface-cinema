import { describe, expect, it } from 'vitest'
import { dateCaption } from './captions.ts'
import type { FrameState } from './timeline.ts'

const dates = ['2030-01-02', '2030-01-03', '2030-02-20']
const st = (over: Partial<FrameState>): FrameState => ({ n: 0, i: 0, j: 0, rawAlpha: 0, alpha: 0, phase: 'hold', ...over })

describe('dateCaption', () => {
  it('during a hold it is the date', () => {
    expect(dateCaption(st({ i: 1, j: 1 }), dates)).toBe('2030-01-03')
  })
  it('between dates within 7 days it switches at rawAlpha 0.5: before = date i, from 0.5 on = date j', () => {
    const t = (rawAlpha: number, alpha = 0) => dateCaption(st({ i: 0, j: 1, rawAlpha, alpha, phase: 'transition' }), dates)
    expect(t(0.25)).toBe('2030-01-02')
    expect(t(0.4999)).toBe('2030-01-02')
    expect(t(0.5)).toBe('2030-01-03')
    expect(t(0.75)).toBe('2030-01-03')
  })
  it('uses rawAlpha, not eased alpha: the switch frame is the same for every easing', () => {
    // alpha is 0.9 but rawAlpha is 0.25 -> still the first date.
    expect(dateCaption(st({ i: 0, j: 1, rawAlpha: 0.25, alpha: 0.9, phase: 'transition' }), dates)).toBe('2030-01-02')
    expect(dateCaption(st({ i: 0, j: 1, rawAlpha: 0.75, alpha: 0.1, phase: 'transition' }), dates)).toBe('2030-01-03')
  })
  it('between dates further apart than gapDays it names both and says interpolated', () => {
    const s = st({ i: 1, j: 2, rawAlpha: 0.3, phase: 'transition' })
    expect(dateCaption(s, dates)).toBe('2030-01-03 → 2030-02-20 (interpolated)')
    expect(dateCaption(s, dates)).toBe(dateCaption({ ...s, rawAlpha: 0.9 }, dates)) // same text for the whole transition
  })
  it('the wrap pair (last -> first) is far apart, so it reads as interpolated', () => {
    expect(dateCaption(st({ i: 2, j: 0, rawAlpha: 0.5, phase: 'transition' }), dates)).toBe('2030-02-20 → 2030-01-02 (interpolated)')
  })
  it('gapDays is a parameter: exactly 7 days apart is NOT interpolated, 8 is', () => {
    const d = ['2030-01-01', '2030-01-08', '2030-01-16']
    expect(dateCaption(st({ i: 0, j: 1, rawAlpha: 0.2, phase: 'transition' }), d)).toBe('2030-01-01')
    expect(dateCaption(st({ i: 1, j: 2, rawAlpha: 0.2, phase: 'transition' }), d)).toBe('2030-01-08 → 2030-01-16 (interpolated)')
    expect(dateCaption(st({ i: 0, j: 1, rawAlpha: 0.2, phase: 'transition' }), d, 6)).toBe('2030-01-01 → 2030-01-08 (interpolated)')
  })
})
