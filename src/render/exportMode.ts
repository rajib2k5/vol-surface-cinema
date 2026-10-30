/**
 * Export mode (?export=1&dataset=<id>&w=<px>&h=<px>&fps=<n>): no controls, no OrbitControls, exact
 * stage size, pixel ratio 1, nothing animated. The page only draws frames when window.__cinema
 * asks for them; the headless CLI (scripts/export.ts) drives that.
 */
import { DatasetError, loadDataset } from '../lib/dataset.ts'
import type { Query } from '../lib/query.ts'
import { showError } from './errorPanel.ts'
import { createCinemaApi } from './exportHook.ts'
import { createViewer } from './viewer.ts'

export function mountExport(stage: HTMLElement, controlsHost: HTMLElement, query: Query): void {
  document.documentElement.classList.add('export')
  controlsHost.remove()
  document.getElementById('meta')?.remove()
  const width = query.width ?? 1280
  const height = query.height ?? 720
  stage.style.width = `${width}px`
  stage.style.height = `${height}px`

  let failRef: (message: string) => void = () => {}
  const init = (async () => {
    const { sequence } = await loadDataset(query.dataset)
    const fps = query.fps ?? sequence.playback?.fps ?? 30
    const viewer = createViewer({
      stage,
      sequence,
      fps,
      exportMode: true,
      onFatal: (message) => {
        console.error(`export failed: ${message}`)
        failRef(message)
      },
    })
    viewer.resize(width, height)
    await viewer.ready
    return { viewer, fps, width, height }
  })()
  const { api, fail } = createCinemaApi(init, (cb) => requestAnimationFrame(() => cb()))
  failRef = fail
  window.__cinema = api
  init.catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e)
    // The CLI treats a console error as a render failure (exit 4).
    console.error(`export failed: ${message}`)
    if (e instanceof DatasetError) showError(stage, e.message, e.errors)
    else showError(stage, message)
  })
}
