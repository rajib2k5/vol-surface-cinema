/** Boot: read the query, load the dataset through index.json, draw frame 0 (M1). Playback and export arrive in M2/M3. */
import { loadDataset, DatasetError } from './lib/dataset.ts'
import { sequenceIvExtent } from './lib/extent.ts'
import { parseQuery } from './lib/query.ts'
import { AZIMUTH_0, createScene } from './render/scene.ts'
import { showError } from './render/errorPanel.ts'

async function boot(): Promise<void> {
  const stage = document.getElementById('stage') as HTMLElement
  const query = parseQuery(location.search)
  try {
    const { sequence } = await loadDataset(query.dataset)
    const scene = createScene({
      stage,
      moneyness: sequence.grid.k,
      dte: sequence.grid.dte,
      ivExtent: sequenceIvExtent(sequence),
      exportMode: false,
      onContextLost: () => {},
    })
    const fit = () => scene.resize(stage.clientWidth, stage.clientHeight)
    fit()
    window.addEventListener('resize', fit)
    scene.setFrame(sequence.frames[0].iv, AZIMUTH_0)
    const badge = document.createElement('div')
    badge.className = 'badge'
    badge.textContent = sequence.badge
    stage.appendChild(badge)
  } catch (e) {
    if (e instanceof DatasetError) showError(stage, e.message, e.errors)
    else showError(stage, `Unexpected error: ${(e as Error).message}`)
  }
}

void boot()
