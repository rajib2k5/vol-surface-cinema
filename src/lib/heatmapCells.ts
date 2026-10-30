/** Pure geometry and colour of the canvas heatmap fallback (render/heatmap.ts draws these). */
import { rampSrgb } from './colorRamp.ts'
import type { Extent } from './surfaceGeometry.ts'

export interface HeatCell {
  x: number
  y: number
  w: number
  h: number
  css: string
}

/** One rect per cell, row-major, row 0 (shortest dte) at the top; colour = ramp at (iv - lo) / (hi - lo), clamped. */
export function heatmapCells(iv: readonly (readonly number[])[], extent: Extent, width: number, height: number): HeatCell[] {
  const nT = iv.length
  if (nT === 0) return []
  const nK = iv[0].length
  const [lo, hi] = extent
  const w = width / nK
  const h = height / nT
  const cells: HeatCell[] = []
  for (let i = 0; i < nT; i++)
    for (let j = 0; j < nK; j++) {
      const t = hi === lo ? 0 : (iv[i][j] - lo) / (hi - lo)
      const [r, g, b] = rampSrgb(t)
      cells.push({ x: j * w, y: i * h, w, h, css: `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})` })
    }
  return cells
}
