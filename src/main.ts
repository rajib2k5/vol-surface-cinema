/** Boot: read the query, then mount the live player or, with ?export=1, the export mode the headless CLI drives. */
import { DatasetError, loadDataset } from './lib/dataset.ts'
import { createPlayer } from './lib/player.ts'
import { noticeLines } from './lib/notice.ts'
import { parseQuery } from './lib/query.ts'
import { createControls } from './render/controls.ts'
import { createDatasetMenu } from './render/datasetMenu.ts'
import { showError } from './render/errorPanel.ts'
import { mountExport } from './render/exportMode.ts'
import { showNotice } from './render/noticePanel.ts'
import { createViewer } from './render/viewer.ts'

async function boot(): Promise<void> {
  const stage = document.getElementById('stage') as HTMLElement
  const controlsHost = document.getElementById('controls') as HTMLElement
  const query = parseQuery(location.search)
  if (query.export) {
    mountExport(stage, controlsHost, query)
    return
  }
  try {
    const { sequence, index } = await loadDataset(query.dataset)
    createDatasetMenu(document.getElementById('dataset-menu') as HTMLElement, index, sequence.id, (href) => location.assign(href))
    showNotice(document.getElementById('notice') as HTMLElement, noticeLines(sequence))
    // fps precedence (live): page ?fps= > playback.fps > 30.
    const fps = query.fps ?? sequence.playback?.fps ?? 30
    const viewer = createViewer({ stage, sequence, fps, exportMode: false })
    const player = createPlayer({ total: viewer.total, fps, loop: viewer.spec.loop, now: () => performance.now() })
    const fit = () => viewer.resize(stage.clientWidth, stage.clientHeight)
    fit()
    window.addEventListener('resize', fit)

    let shown = -1
    let lastState = ''
    const controls = createControls({
      host: controlsHost,
      spec: viewer.spec,
      total: viewer.total,
      dates: viewer.dates,
      events: viewer.events,
      player,
      onUserAction: () => tick(),
    })

    function tick(): void {
      const n = player.current()
      const state = player.state()
      if (n !== shown) {
        viewer.show(n)
        shown = n
      }
      if (state !== lastState) {
        viewer.setControlsEnabled(state !== 'playing')
        lastState = state
      }
      controls.sync(n, state)
    }
    const loop = () => {
      tick()
      requestAnimationFrame(loop)
    }
    player.play()
    requestAnimationFrame(loop)
  } catch (e) {
    if (e instanceof DatasetError) showError(stage, e.message, e.errors)
    else showError(stage, `Unexpected error: ${(e as Error).message}`)
  }
}

void boot()
