/**
 * window.__cinema: the seam the headless export drives. renderFrame(n) applies frame n, draws it and
 * resolves after two animation frames, so the pixels are on screen. It rejects RangeError for n
 * outside [0, totalFrames) and Error('busy') while another call is pending.
 */
export interface CinemaReady {
  totalFrames: number
  fps: number
  width: number
  height: number
}

export interface CinemaApi {
  version: 1
  ready: Promise<CinemaReady>
  renderFrame(n: number): Promise<void>
}

export interface CinemaInit {
  viewer: { total: number; show(n: number): void }
  fps: number
  width: number
  height: number
}

export function createCinemaApi(init: Promise<CinemaInit>, raf: (cb: () => void) => void): { api: CinemaApi; fail(message: string): void } {
  let info: CinemaInit | null = null
  let busy = false
  let fatal: string | null = null
  const ready = init.then((i) => {
    info = i
    return { totalFrames: i.viewer.total, fps: i.fps, width: i.width, height: i.height }
  })
  ready.catch(() => undefined) // callers see the rejection through api.ready; this keeps it from being reported twice

  const frame = () => new Promise<void>((resolve) => raf(resolve))

  const api: CinemaApi = {
    version: 1,
    ready,
    async renderFrame(n) {
      if (busy) throw new Error('busy')
      busy = true
      try {
        if (fatal) throw new Error(fatal)
        if (!info) throw new Error('not ready: await window.__cinema.ready first')
        if (!Number.isInteger(n) || n < 0 || n >= info.viewer.total) throw new RangeError(`frame ${n} is outside [0, ${info.viewer.total})`)
        info.viewer.show(n)
        await frame()
        await frame()
      } finally {
        busy = false
      }
    },
  }
  return {
    api,
    fail(message) {
      fatal = message
    },
  }
}

declare global {
  interface Window {
    __cinema?: CinemaApi
  }
}
