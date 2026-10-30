// Adapted from rajib2k5/vol-strategy-backtester (35cb682), MIT: the scene setup of views/SurfaceHero.tsx,
// re-expressed in plain three.js.
/**
 * The three.js side of the player. Impure and thin: every number it draws comes from the pure
 * modules in src/lib. It owns the renderer, the surface mesh, the grid and axis lines, the camera
 * and the DOM axis labels.
 *
 * Everything visual is a function of the arguments of `setFrame`: IV grid and camera azimuth. Nothing
 * here reads a clock.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { axisLabels, buildTopology, writeHeights, type AxisLabel, type Extent, type SurfaceExtent } from '../lib/surfaceGeometry.ts'
import { AXIS_SEGMENTS, ORBIT_TARGET } from '../lib/surfaceScene.ts'
import { CAMERA_START, cameraPosition } from '../lib/orbit.ts'
import { BASE_FOV, fovForAspect } from '../lib/framing.ts'
import { labelTransform, ndcToPixels } from '../lib/labelProjection.ts'

// Grey that stays visible on both a light and a dark card.
const GUIDE_GREY = '#8a8f98'
export interface SceneOptions {
  stage: HTMLElement
  moneyness: readonly number[]
  dte: readonly number[]
  ivExtent: Extent
  /** Export mode: preserveDrawingBuffer on, pixel ratio 1, no orbit controls. */
  exportMode: boolean
  onContextLost: () => void
}


export interface SurfaceScene {
  canvas: HTMLCanvasElement
  setFrame(iv: readonly (readonly number[])[], azimuth: number): void
  /** OrbitControls are live only while the player is paused. Pressing play calls setFrame, which resets the camera. */
  setControlsEnabled(enabled: boolean): void
  resize(width: number, height: number): void
  render(): void
  dispose(): void
}

export function createScene(opts: SceneOptions): SurfaceScene {
  const { stage, moneyness, dte, ivExtent, exportMode } = opts
  const nK = moneyness.length
  const nT = dte.length

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: exportMode })
  renderer.toneMapping = NoToneMapping
  renderer.setPixelRatio(exportMode ? 1 : Math.min(window.devicePixelRatio || 1, 2))
  const canvas = renderer.domElement
  canvas.setAttribute('aria-label', 'Rotatable 3D implied volatility surface')
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    opts.onContextLost()
  })
  stage.prepend(canvas)

  const topo = buildTopology(nT, nK)
  const positions = new Float32Array(3 * nT * nK)
  const colors = new Float32Array(3 * nT * nK)
  const posAttr = new BufferAttribute(positions, 3)
  const colAttr = new BufferAttribute(colors, 3)

  const meshGeo = new BufferGeometry()
  meshGeo.setAttribute('position', posAttr)
  meshGeo.setAttribute('color', colAttr)
  meshGeo.setIndex(new BufferAttribute(topo.indices, 1))
  // Unlit material: the vertex colours ARE the ramp, shading would distort them. polygonOffset pushes
  // the faces back a hair so the grid lines on top do not z-fight with them.
  const meshMat = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  const mesh = new Mesh(meshGeo, meshMat)

  const gridGeo = new BufferGeometry()
  gridGeo.setAttribute('position', posAttr)
  gridGeo.setIndex(new BufferAttribute(topo.lineIndices, 1))
  const gridMat = new LineBasicMaterial({ color: new Color(GUIDE_GREY), transparent: true, opacity: 0.5 })
  const grid = new LineSegments(gridGeo, gridMat)

  const axisGeo = new BufferGeometry()
  axisGeo.setAttribute('position', new BufferAttribute(AXIS_SEGMENTS, 3))
  const axisMat = new LineBasicMaterial({ color: new Color(GUIDE_GREY) })
  const axes = new LineSegments(axisGeo, axisMat)

  const scene = new Scene()
  scene.add(mesh, grid, axes)

  const camera = new PerspectiveCamera(BASE_FOV, 16 / 9, 0.1, 50)
  camera.position.set(...CAMERA_START)
  const target = new Vector3(...ORBIT_TARGET)
  camera.lookAt(target)

  // OrbitControls: live mode only, no damping (damping is wall-clock driven), no zoom (it would
  // swallow page scrolling), no pan.
  let controls: OrbitControls | null = null
  if (!exportMode) {
    controls = new OrbitControls(camera, canvas)
    controls.target.copy(target)
    controls.enablePan = false
    controls.enableZoom = false
    controls.enableDamping = false
    controls.enabled = false
    controls.addEventListener('change', () => render())
  }

  // Axis labels: plain DOM, positioned from the 3D anchors on every render.
  let labels: AxisLabel[] = []
  const labelEls: HTMLSpanElement[] = []
  const labelLayer = document.createElement('div')
  labelLayer.className = 'labels'
  labelLayer.setAttribute('aria-hidden', 'true')
  stage.appendChild(labelLayer)
  const projected = new Vector3()
  let width = 1
  let height = 1

  function rebuildLabels(extent: SurfaceExtent): void {
    labels = axisLabels(extent)
    labelLayer.replaceChildren()
    labelEls.length = 0
    for (const l of labels) {
      const span = document.createElement('span')
      span.className = l.title ? 'axis axis-title' : 'axis'
      span.textContent = l.text
      labelLayer.appendChild(span)
      labelEls.push(span)
    }
  }
  rebuildLabels({
    moneyness: [Math.min(...moneyness), Math.max(...moneyness)],
    dte: [Math.min(...dte), Math.max(...dte)],
    iv: ivExtent,
  })

  function render(): void {
    camera.updateMatrixWorld()
    labels.forEach((label, i) => {
      projected.set(...label.at).project(camera)
      const el = labelEls[i]
      el.style.transform = labelTransform(ndcToPixels(projected, { width, height }))
      el.style.visibility = 'visible'
    })
    renderer.render(scene, camera)
  }

  return {
    canvas,
    setFrame(iv, azimuth) {
      writeHeights(moneyness, dte, iv, ivExtent, positions, colors)
      posAttr.needsUpdate = true
      colAttr.needsUpdate = true
      if (!controls || !controls.enabled) {
        camera.position.set(...cameraPosition(azimuth))
        camera.lookAt(target)
      }
      render()
    },
    setControlsEnabled(enabled) {
      if (controls) controls.enabled = enabled
    },
    resize(w, h) {
      width = w
      height = h
      renderer.setSize(w, h, false)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      camera.aspect = w / h
      camera.fov = fovForAspect(w / h)
      camera.updateProjectionMatrix()
      render()
    },
    render,
    dispose() {
      controls?.dispose()
      meshGeo.dispose()
      gridGeo.dispose()
      axisGeo.dispose()
      meshMat.dispose()
      gridMat.dispose()
      axisMat.dispose()
      renderer.dispose()
      canvas.remove()
      labelLayer.remove()
    },
  }
}
