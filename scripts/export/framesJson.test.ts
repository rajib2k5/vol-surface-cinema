import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSequence, type Sequence } from '../../src/lib/contract.ts'
import { buildFramesDoc, exportFramesJson, type FramesDoc } from './framesJson.ts'

const dataDir = new URL('../../public/data/', import.meta.url)
const file = (name: string) => readFileSync(new URL(name, dataDir), 'utf8')
const seqOf = (name: string): Sequence => {
  const r = parseSequence(JSON.parse(file(name)))
  if (!r.ok) throw new Error('committed dataset invalid')
  return r.value
}
const synthetic = seqOf('synthetic-regime-story.json')
const real = seqOf('optionsdx-spy-4dates.json')

describe('buildFramesDoc', () => {
  const doc = buildFramesDoc(real, 30, { width: 640, height: 360 })
  it('has the header: fps, size, grid, fixed extent, and the badge the data rule needs on screen', () => {
    expect(doc).toMatchObject({ schema: 'vol-surface-cinema/frames-json', schema_version: 1, id: 'optionsdx-spy-4dates', fps: 30, width: 640, height: 360 })
    expect(doc.grid).toEqual(real.grid)
    expect(doc.badge).toBe(real.badge)
    // The real dataset's global IV range, to the 6 dp the file holds.
    const all = real.frames.flatMap((f) => f.iv.flat())
    expect(doc.extent).toEqual([Math.min(...all), Math.max(...all)])
  })
  it('has one frame per timeline frame, numbered 0..total-1 (301 for the real dataset at 30 fps)', () => {
    expect(doc.frames).toHaveLength(301)
    expect(doc.frames.map((f) => f.n)).toEqual(Array.from({ length: 301 }, (_, i) => i))
  })
  it('a hold frame carries its date grid exactly, and the plain date as caption', () => {
    expect(doc.frames[0].iv).toEqual(real.frames[0].iv)
    expect(doc.frames[0].caption).toBe('2017-11-03')
    expect(doc.frames[30].iv).toEqual(real.frames[0].iv) // last hold frame of date 0
  })
  it('the halfway frame of a transition is the 50/50 mix in total variance (worked by hand for one cell)', () => {
    // Date 0 holds n = 0..30; transition n = 31..90 with rawAlpha = (n - 30) / 60; n = 60 is rawAlpha 0.5, smoothstep(0.5) = 0.5.
    const f = doc.frames[60]
    const [i, j] = [3, 15] // 30 days, k = 0
    const T = real.grid.dte[i] / 365
    const wA = real.frames[0].iv[i][j] ** 2 * T
    const wB = real.frames[1].iv[i][j] ** 2 * T
    expect(f.iv[i][j]).toBeCloseTo(Math.sqrt((0.5 * wA + 0.5 * wB) / T), 6)
    expect(f.caption).toBe('2017-11-03 → 2018-02-05 (interpolated)')
  })
  it('rounds IVs to 6 dp, so the file stays small', () => {
    for (const v of doc.frames[60].iv.flat()) expect(Math.round(v * 1e6) / 1e6).toBe(v)
  })
  it('lists the events whose window covers the frame, with their opacity in (0, 1]', () => {
    expect(doc.frames[0].events).toEqual([]) // nothing on the calm opening date
    // Date 1 (the February 2018 spike) starts at n = 90 (date 0: 30 + 60 frames).
    expect(doc.frames[90].events).toEqual([{ label: 'February 2018 volatility spike', opacity: 1 }])
    const shown = doc.frames.filter((f) => f.events.length > 0)
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThan(doc.frames.length)
    for (const f of doc.frames) for (const e of f.events) expect(e.opacity).toBeGreaterThan(0)
    for (const f of doc.frames) for (const e of f.events) expect(e.opacity).toBeLessThanOrEqual(1)
  })
  it('a looping synthetic story wraps: its last frame is a transition back to the first date', () => {
    const d = buildFramesDoc(synthetic, 30, { width: 640, height: 360 })
    expect(d.frames.length).toBe(450)
    expect(d.frames.at(-1)?.caption).toMatch(/^2030-03-/)
    expect(d.frames[0].caption).toBe('2030-01-02')
  })
  it('a fps override changes the frame count (10 fps: 101 frames)', () => {
    expect(buildFramesDoc(real, 10, { width: 640, height: 360 }).frames).toHaveLength(101)
  })
})

describe('exportFramesJson', () => {
  const readers = (index: string, files: Record<string, string>) => ({ readIndex: () => index, readDataset: (f: string) => files[f] ?? null })
  const index = JSON.stringify({ datasets: [{ id: 'synthetic-regime-story', title: 'S', file: 'synthetic-regime-story.json' }, { id: 'optionsdx-spy-4dates', title: 'R', file: 'optionsdx-spy-4dates.json' }] })
  const files = { 'synthetic-regime-story.json': file('synthetic-regime-story.json'), 'optionsdx-spy-4dates.json': file('optionsdx-spy-4dates.json') }
  const opts = { dataset: 'optionsdx-spy-4dates', fps: null, size: { width: 640, height: 360 }, maxFrames: 10_000 }

  it('returns JSON text that parses back to the same document', () => {
    const r = exportFramesJson({ ...readers(index, files), ...opts })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const doc = JSON.parse(r.text) as FramesDoc
    expect(doc.frames).toHaveLength(301)
    expect(doc.fps).toBe(30) // playback.fps of the dataset, since no --fps
  })
  it('uses the default dataset (the first in the index) when none is named', () => {
    const r = exportFramesJson({ ...readers(index, files), ...opts, dataset: null })
    expect(r.ok && (JSON.parse(r.text) as FramesDoc).id).toBe('synthetic-regime-story')
  })
  it('--fps wins over playback.fps', () => {
    const r = exportFramesJson({ ...readers(index, files), ...opts, fps: 10 })
    expect(r.ok && (JSON.parse(r.text) as FramesDoc).frames.length).toBe(101)
  })
  it('exits 2 for an unknown dataset id, and never reads a file for it', () => {
    const read: string[] = []
    const r = exportFramesJson({ readIndex: () => index, readDataset: (f) => (read.push(f), null), ...opts, dataset: 'nope' })
    expect(r).toMatchObject({ ok: false, code: 2 })
    expect(read).toEqual([])
  })
  it('exits 2 when the sequence is over --max-frames', () => {
    expect(exportFramesJson({ ...readers(index, files), ...opts, maxFrames: 100 })).toMatchObject({ ok: false, code: 2, message: expect.stringContaining('--max-frames') })
  })
  it('exits 4 for a dataset file that is missing or fails the contract', () => {
    expect(exportFramesJson({ ...readers(index, {}), ...opts })).toMatchObject({ ok: false, code: 4 })
    const broken = { ...files, 'optionsdx-spy-4dates.json': '{"schema":"x"}' }
    expect(exportFramesJson({ ...readers(index, broken), ...opts })).toMatchObject({ ok: false, code: 4 })
  })
  it('exits 4 for an index that is not valid', () => {
    expect(exportFramesJson({ ...readers('{nope', files), ...opts })).toMatchObject({ ok: false, code: 4 })
  })
})
