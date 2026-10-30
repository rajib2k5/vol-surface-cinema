import { describe, expect, it } from 'vitest'
import { heatmapCells } from './heatmapCells.ts'
import { rampSrgb } from './colorRamp.ts'

describe('heatmapCells', () => {
  // 2 rows (dte) x 3 columns (k), 300 x 100 px: each cell 100 x 50. Row 0 is drawn at the top.
  const iv = [[0.2, 0.3, 0.4], [0.5, 0.6, 0.6]]
  const cells = heatmapCells(iv, [0.2, 0.6], 300, 100)
  it('one rect per cell in row-major order, tiling the canvas exactly', () => {
    expect(cells).toHaveLength(6)
    expect(cells.map((c) => [c.x, c.y, c.w, c.h])).toEqual([
      [0, 0, 100, 50], [100, 0, 100, 50], [200, 0, 100, 50],
      [0, 50, 100, 50], [100, 50, 100, 50], [200, 50, 100, 50],
    ])
  })
  it('colour is the ramp at (iv - lo) / (hi - lo): min IV is the light end, max the dark end', () => {
    const css = (t: number) => {
      const [r, g, b] = rampSrgb(t)
      return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
    }
    expect(cells[0].css).toBe('rgb(134, 182, 239)') // #86b6ef
    expect(cells[0].css).toBe(css(0))
    expect(cells[4].css).toBe('rgb(24, 79, 149)') // iv 0.6 -> #184f95
    expect(cells[1].css).toBe(css(0.25))
  })
  it('clamps an IV outside the extent to the ends of the ramp', () => {
    const c = heatmapCells([[0.1, 0.9]], [0.2, 0.6], 20, 10)
    expect(c[0].css).toBe('rgb(134, 182, 239)')
    expect(c[1].css).toBe('rgb(24, 79, 149)')
  })
  it('a degenerate extent colours everything with the ramp start without NaN', () => {
    const c = heatmapCells([[0.2, 0.2]], [0.2, 0.2], 20, 10)
    expect(c.every((x) => x.css === 'rgb(134, 182, 239)')).toBe(true)
  })
  it('an empty grid gives no cells', () => {
    expect(heatmapCells([], [0, 1], 10, 10)).toEqual([])
  })
})
