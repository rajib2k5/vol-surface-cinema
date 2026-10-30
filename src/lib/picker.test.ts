import { describe, expect, it } from 'vitest'
import { keyAction, pickerItems } from './picker.ts'
import type { TimelineSpec } from './timeline.ts'

describe('keyAction', () => {
  it('Space toggles, ArrowLeft steps back, ArrowRight steps forward, anything else is null', () => {
    expect(keyAction(' ')).toBe('toggle')
    expect(keyAction('ArrowLeft')).toBe('prev')
    expect(keyAction('ArrowRight')).toBe('next')
    expect(keyAction('a')).toBeNull()
    expect(keyAction('Enter')).toBeNull()
  })
})

describe('pickerItems', () => {
  const spec: TimelineSpec = { dates: 3, transitionFrames: 4, holdFrames: [0, 2, 0], loop: true, easing: 'linear' }
  const dates = ['2030-01-02', '2030-01-03', '2030-01-04']
  it('one item per date with its start frame (0, 4, 10), marking dates that carry an event', () => {
    const items = pickerItems(spec, dates, [{ dateIndex: 1, label: 'Spike' }])
    expect(items).toEqual([
      { label: '2030-01-02', frame: 0, event: null },
      { label: '2030-01-03', frame: 4, event: 'Spike' },
      { label: '2030-01-04', frame: 10, event: null },
    ])
  })
})
