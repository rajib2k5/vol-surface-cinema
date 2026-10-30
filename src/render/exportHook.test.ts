import { describe, expect, it } from 'vitest'
import { createCinemaApi } from './exportHook.ts'

function setup(opts: { total?: number; initError?: Error; showThrows?: boolean } = {}) {
  const shown: number[] = []
  let rafCalls = 0
  const raf = (cb: () => void) => {
    rafCalls++
    queueMicrotask(cb)
  }
  const init = opts.initError
    ? Promise.reject(opts.initError)
    : Promise.resolve({
        viewer: {
          total: opts.total ?? 10,
          show: (n: number) => {
            if (opts.showThrows) throw new Error('draw failed')
            shown.push(n)
          },
        },
        fps: 30,
        width: 320,
        height: 180,
      })
  const { api, fail } = createCinemaApi(init, raf)
  return { api, fail, shown, rafCalls: () => rafCalls }
}

describe('window.__cinema', () => {
  it('version 1, and ready resolves to totalFrames, fps, width, height', async () => {
    const { api } = setup({ total: 450 })
    expect(api.version).toBe(1)
    await expect(api.ready).resolves.toEqual({ totalFrames: 450, fps: 30, width: 320, height: 180 })
  })
  it('ready rejects when loading fails (404, contract error, no WebGL)', async () => {
    const { api } = setup({ initError: new Error('HTTP 404') })
    await expect(api.ready).rejects.toThrow('HTTP 404')
  })
  it('renderFrame(n) draws frame n and resolves after two animation frames', async () => {
    const { api, shown, rafCalls } = setup()
    await api.ready
    await api.renderFrame(4)
    expect(shown).toEqual([4])
    expect(rafCalls()).toBe(2)
  })
  it('rejects RangeError for n outside [0, totalFrames) or not an integer, without drawing', async () => {
    const { api, shown } = setup({ total: 10 })
    await api.ready
    for (const n of [-1, 10, 11, 1.5, NaN]) await expect(api.renderFrame(n), `n=${n}`).rejects.toBeInstanceOf(RangeError)
    expect(shown).toEqual([])
  })
  it('a second call while one is pending rejects with Error("busy"); the first still completes, and calls work again afterwards', async () => {
    const { api, shown } = setup()
    await api.ready
    const first = api.renderFrame(1)
    const second = api.renderFrame(2)
    await expect(second).rejects.toThrow('busy')
    await first
    expect(shown).toEqual([1])
    await api.renderFrame(3)
    expect(shown).toEqual([1, 3])
  })
  it('a draw error rejects the call and releases the busy flag', async () => {
    const { api } = setup({ showThrows: true })
    await api.ready
    await expect(api.renderFrame(0)).rejects.toThrow('draw failed')
    await expect(api.renderFrame(0)).rejects.toThrow('draw failed') // not "busy"
  })
  it('renderFrame before ready fails instead of drawing', async () => {
    const { api } = setup({ initError: new Error('nope') })
    await api.ready.catch(() => undefined)
    await expect(api.renderFrame(0)).rejects.toThrow()
  })
  it('after fail(message) (WebGL context lost) every renderFrame rejects with that message', async () => {
    const { api, fail } = setup()
    await api.ready
    fail('WebGL context lost')
    await expect(api.renderFrame(0)).rejects.toThrow('WebGL context lost')
  })
})
