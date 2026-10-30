// Rewrite of the Heatmap in rajib2k5/vol-strategy-backtester lib/charts.tsx (35cb682, MIT) as a 2D canvas.
/**
 * The canvas heatmap fallback, used when WebGL is unavailable or its context is lost. One rect per
 * grid cell coloured by the same ramp as the surface; axis labels are DOM text. It redraws on every
 * frame, so the controls still work. The cell geometry and colours are pure (lib/heatmapCells.ts).
 */
import { heatmapCells } from '../lib/heatmapCells.ts'
import { fmt } from '../lib/format.ts'
import type { Extent } from '../lib/surfaceGeometry.ts'

export interface HeatmapView {
  canvas: HTMLCanvasElement
  setFrame(iv: readonly (readonly number[])[]): void
  resize(width: number, height: number): void
  dispose(): void
}

const PAD = { l: 60, t: 40, r: 16, b: 34 }

export function createHeatmap(stage: HTMLElement, k: readonly number[], dte: readonly number[], ivExtent: Extent): HeatmapView {
  const wrap = document.createElement('div')
  wrap.className = 'fallback'
  const canvas = document.createElement('canvas')
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', 'Implied volatility heatmap (the 3D view is unavailable)')
  const note = document.createElement('p')
  note.textContent = '3D view unavailable: WebGL could not start. The same grid is shown as a heatmap.'
  const labels = document.createElement('div')
  labels.setAttribute('aria-hidden', 'true')
  wrap.append(canvas, labels, note)
  stage.prepend(wrap)

  let width = 1
  let height = 1
  let last: readonly (readonly number[])[] | null = null

  function span(text: string, left: number, top: number, anchor: 'end' | 'middle'): void {
    const el = document.createElement('span')
    el.className = 'axis'
    el.style.visibility = 'visible'
    el.textContent = text
    el.style.transform = anchor === 'end' ? `translate(${left}px, ${top}px) translate(-100%, -50%)` : `translate(${left}px, ${top}px) translate(-50%, 0)`
    labels.appendChild(el)
  }

  function draw(): void {
    const ctx = canvas.getContext('2d')
    if (!ctx || !last) return
    const pw = Math.max(1, width - PAD.l - PAD.r)
    const ph = Math.max(1, height - PAD.t - PAD.b)
    ctx.clearRect(0, 0, width, height)
    for (const c of heatmapCells(last, ivExtent, pw, ph)) {
      ctx.fillStyle = c.css
      ctx.fillRect(PAD.l + c.x, PAD.t + c.y, Math.ceil(c.w) - 0.5, Math.ceil(c.h) - 0.5)
    }
    labels.replaceChildren()
    const rowH = ph / dte.length
    dte.forEach((d, i) => span(`${d}d`, PAD.l - 6, PAD.t + i * rowH + rowH / 2, 'end'))
    const colW = pw / k.length
    const every = Math.max(1, Math.ceil(k.length / 6))
    k.forEach((x, j) => {
      if (j % every === 0 || j === k.length - 1) span(fmt(x, 2), PAD.l + j * colW + colW / 2, PAD.t + ph + 6, 'middle')
    })
  }

  return {
    canvas,
    setFrame(iv) {
      last = iv
      draw()
    },
    resize(w, h) {
      width = w
      height = h
      canvas.width = w
      canvas.height = h
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      draw()
    },
    dispose() {
      wrap.remove()
    },
  }
}
