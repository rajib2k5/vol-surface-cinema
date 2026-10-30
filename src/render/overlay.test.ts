// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createOverlay } from './overlay.ts'

describe('overlay note line (extrapolated share)', () => {
  it('shows the note under the caption, and clears it when the note is null', () => {
    const stage = document.createElement('div')
    const o = createOverlay(stage, 'badge', [])
    o.set('2017-11-03', [], '35% of cells extrapolated')
    expect(stage.querySelector('.extrap-note')?.textContent).toBe('35% of cells extrapolated')
    o.set('2017-11-03', [], null)
    expect(stage.querySelector('.extrap-note')?.textContent).toBe('')
    o.set('2017-11-03', [])
    expect(stage.querySelector('.extrap-note')?.textContent).toBe('')
  })
  it('puts the note in through textContent only', () => {
    const stage = document.createElement('div')
    const o = createOverlay(stage, 'badge', [])
    o.set('d', [], '<img src=x onerror=alert(1)>')
    expect(stage.querySelector('img')).toBeNull()
    expect(stage.querySelector('.extrap-note')?.textContent).toBe('<img src=x onerror=alert(1)>')
  })
})
