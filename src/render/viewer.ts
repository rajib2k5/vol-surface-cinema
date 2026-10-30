/**
 * Everything visual for one frame, as a function of the frame index n. Both the live player and the
 * export hook call show(n); neither reads a clock. n -> frameAt -> interpolate -> scene + overlay.
 */
import type { Sequence } from '../lib/contract.ts'
import { dateCaption, extrapolationNote } from '../lib/captions.ts'
import { activeEvents, eventsFromSequence } from '../lib/events.ts'
import { sequenceIvExtent } from '../lib/extent.ts'
import { interpolateIv, makeIvBuffer, precomputeW } from '../lib/interpolate.ts'
import { orbitAzimuth } from '../lib/orbit.ts'
import { frameAt, specFromSequence, totalFrames, type TimelineSpec } from '../lib/timeline.ts'
import { createHeatmap, type HeatmapView } from './heatmap.ts'
import { createOverlay, type Overlay } from './overlay.ts'
import { createScene, type SurfaceScene } from './scene.ts'
import { detectWebGL } from './webgl.ts'

export interface ViewerOptions {
  stage: HTMLElement
  sequence: Sequence
  fps: number
  exportMode: boolean
  /** Export mode: no heatmap fallback. WebGL missing or lost is fatal and reported through onFatal. */
  onFatal?: (message: string) => void
}

export interface Viewer {
  spec: TimelineSpec
  total: number
  backend(): 'webgl' | 'heatmap'
  /** Draw frame n (an integer in [0, total)). */
  show(n: number): void
  /** Redraw the last frame, e.g. after a resize. */
  redraw(): void
  resize(width: number, height: number): void
  /** OrbitControls are live only while paused (live mode). */
  setControlsEnabled(enabled: boolean): void
  /** Resolves when the overlay font is ready. */
  ready: Promise<void>
  dates: string[]
  events: { dateIndex: number; label: string; kind?: string }[]
  dispose(): void
}

export function createViewer(o: ViewerOptions): Viewer {
  const { stage, sequence, fps, exportMode } = o
  const spec = specFromSequence(sequence, fps)
  const total = totalFrames(spec)
  const wg = precomputeW(sequence)
  const buf = makeIvBuffer(wg.nT, wg.nK)
  const ivExtent = sequenceIvExtent(sequence)
  const events = eventsFromSequence(sequence, fps)
  const dates = sequence.frames.map((f) => f.date)
  const quotedShares = sequence.frames.map((f) => f.quoted_share)
  const turns = sequence.display?.orbit_turns ?? 0
  const overlay: Overlay = createOverlay(stage, sequence.badge, events)

  let scene: SurfaceScene | null = null
  let heat: HeatmapView | null = null
  let width = stage.clientWidth || 1
  let height = stage.clientHeight || 1
  let lastN = 0

  function startHeatmap(): void {
    heat = createHeatmap(stage, sequence.grid.k, sequence.grid.dte, ivExtent)
    heat.resize(width, height)
  }

  function onContextLost(): void {
    if (exportMode) {
      o.onFatal?.('WebGL context lost')
      return
    }
    scene?.dispose()
    scene = null
    startHeatmap()
    show(lastN)
  }

  if (detectWebGL()) {
    try {
      scene = createScene({ stage, moneyness: sequence.grid.k, dte: sequence.grid.dte, ivExtent, exportMode, onContextLost })
      scene.resize(width, height)
    } catch (e) {
      if (exportMode) throw new Error(`WebGL failed to start: ${(e as Error).message}`)
      scene = null
    }
  } else if (exportMode) {
    throw new Error('WebGL is unavailable (export mode never falls back to the heatmap)')
  }
  if (!scene) startHeatmap()

  function show(n: number): void {
    if (!Number.isInteger(n) || n < 0 || n >= total) throw new RangeError(`frame ${n} is outside [0, ${total})`)
    lastN = n
    const st = frameAt(spec, n)
    interpolateIv(wg, st.i, st.j, st.alpha, buf)
    if (scene) scene.setFrame(buf, orbitAzimuth(turns, n, total))
    else heat?.setFrame(buf)
    overlay.set(dateCaption(st, dates), activeEvents(spec, events, n), extrapolationNote(st, quotedShares))
  }

  return {
    spec,
    total,
    ready: overlay.ready,
    dates,
    events,
    backend: () => (scene ? 'webgl' : 'heatmap'),
    show,
    redraw: () => show(lastN),
    resize(w, h) {
      width = w
      height = h
      scene?.resize(w, h)
      heat?.resize(w, h)
      show(lastN)
    },
    setControlsEnabled(enabled) {
      scene?.setControlsEnabled(enabled)
    },
    dispose() {
      scene?.dispose()
      heat?.dispose()
      overlay.dispose()
    },
  }
}
