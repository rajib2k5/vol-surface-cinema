// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { applyStageLayout, plotSize, stageLayout } from './stageLayout.ts'

describe('stageLayout', () => {
  it('picks a size class from the stage width', () => {
    expect(stageLayout(1280).size).toBe('lg')
    expect(stageLayout(1000).size).toBe('lg')
    expect(stageLayout(800).size).toBe('md')
    expect(stageLayout(600).size).toBe('md')
    expect(stageLayout(343).size).toBe('sm')
  })
  it('keeps a non-empty plot area below the band', () => {
    for (const [w, h] of [[1280, 720], [800, 450], [343, 429]] as const) {
      const p = plotSize(w, h)
      expect(p.width).toBe(w)
      expect(p.height).toBe(h - stageLayout(w).head)
      expect(p.height).toBeGreaterThan(h / 2)
    }
    // The measured band heights hold the overlay text at these sizes (see the screenshots in the commit message).
    expect(plotSize(1280, 720)).toEqual({ width: 1280, height: 636 })
    expect(plotSize(800, 450)).toEqual({ width: 800, height: 376 })
    expect(plotSize(343, 429)).toEqual({ width: 343, height: 333 })
    expect(plotSize(300, 10).height).toBe(1)
  })
  it('writes data-size and --head-h on the stage', () => {
    const stage = document.createElement('div')
    applyStageLayout(stage, 800)
    expect(stage.dataset.size).toBe('md')
    expect(stage.style.getPropertyValue('--head-h')).toBe(`${stageLayout(800).head}px`)
  })
})
