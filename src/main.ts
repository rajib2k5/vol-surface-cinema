/** M0: draw one hard-coded grid so the toolchain, copied libs and scene are proven end to end. */
import { AZIMUTH_0, createScene } from './render/scene.ts'

const k = Array.from({ length: 26 }, (_, j) => Math.round((-0.3 + 0.02 * j) * 100) / 100)
const dte = [7, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365]
const iv = dte.map((d) => k.map((x) => 0.16 + 0.35 * x * x + 0.1 * (-x) + 0.05 / Math.sqrt(d / 30)))

const stage = document.getElementById('stage') as HTMLElement
const scene = createScene({ stage, moneyness: k, dte, ivExtent: [0.1, 0.6], exportMode: false, onContextLost: () => {} })
const fit = () => scene.resize(stage.clientWidth, stage.clientHeight)
fit()
window.addEventListener('resize', fit)
scene.setFrame(iv, AZIMUTH_0)
