import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyticIv, generate, serialize } from './generate.ts'
import { STORY } from './story.ts'
import { parseSequence, parseSequenceJson } from '../lib/contract.ts'

const FILE = new URL('../../public/data/synthetic-regime-story.json', import.meta.url)
const committedText = readFileSync(FILE, 'utf8')
const committed = JSON.parse(committedText)

describe('generate()', () => {
  const doc = generate()
  it('produces a document that passes the surface-sequence contract', () => {
    const r = parseSequence(doc)
    expect(r.ok, r.ok ? '' : JSON.stringify(r.errors.slice(0, 3))).toBe(true)
  })
  it('has the shape from the design: 60 frames, 26 x 11 grid, three events, synthetic, loop', () => {
    expect(doc.frames).toHaveLength(60)
    expect(doc.grid.k).toHaveLength(26)
    expect(doc.grid.k[0]).toBe(-0.3)
    expect(doc.grid.k[25]).toBe(0.2)
    expect(doc.grid.dte).toEqual([7, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365])
    expect(doc.events.map((e) => e.label)).toEqual(['Volatility spike', 'FOMC decision', 'Recovery'])
    expect(doc.synthetic).toBe(true)
    expect(doc.playback?.loop).toBe(true)
    expect(doc.source.generator).toEqual({ script: 'scripts/generate-synthetic.ts', seed: 20301 })
    expect(doc.frames[0].date).toBe('2030-01-02')
  })
  it('every event date is a frame date', () => {
    const dates = new Set(doc.frames.map((f) => f.date))
    for (const e of doc.events) expect(dates.has(e.date)).toBe(true)
  })
  it('rounds every IV to 6 dp', () => {
    for (const f of doc.frames) for (const row of f.iv) for (const v of row) expect(Math.round(v * 1e6) / 1e6).toBe(v)
  })
})

describe('serialize()', () => {
  it('is JSON.stringify(doc, null, 2) plus a trailing newline', () => {
    const doc = generate()
    expect(serialize(doc)).toBe(JSON.stringify(doc, null, 2) + '\n')
  })
  it('refuses to write more than the byte limit (default 20 MB, injectable)', () => {
    const doc = generate()
    expect(() => serialize(doc, 1000)).toThrow(/limit/)
    expect(() => serialize(doc, 20_000_000)).not.toThrow()
  })
})

describe('committed public/data/synthetic-regime-story.json', () => {
  it('check 5: parses, is finite and positive, and calendar-monotone in w = iv^2 * T on the 11-point grid after rounding', () => {
    const r = parseSequenceJson(committedText)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const T = r.value.grid.dte.map((d) => d / 365)
    for (const [t, f] of r.value.frames.entries()) {
      for (let j = 0; j < r.value.grid.k.length; j++)
        for (let i = 1; i < T.length; i++) {
          const wLo = f.iv[i - 1][j] ** 2 * T[i - 1]
          const wHi = f.iv[i][j] ** 2 * T[i]
          expect(wHi, `frame ${t} k index ${j} dte index ${i}`).toBeGreaterThan(wLo)
        }
    }
  })
  it('check 6a: generate() deep-equals the committed file exactly (drift test: rerun `npm run gen:data` and commit if this fails)', () => {
    expect(generate()).toEqual(committed)
  })
  it('check 6b: the committed text is exactly what serialize() writes', () => {
    expect(serialize(generate())).toBe(committedText)
  })
  it('check 6c: every committed IV is within 5e-7 of the unrounded analytic sqrt(w / T)', () => {
    const exact = analyticIv(STORY)
    let worst = 0
    committed.frames.forEach((f: { iv: number[][] }, t: number) =>
      f.iv.forEach((row, i) =>
        row.forEach((v, j) => {
          worst = Math.max(worst, Math.abs(v - exact[t][i][j]))
        }),
      ),
    )
    expect(worst).toBeLessThanOrEqual(5e-7 + 1e-12)
    expect(worst).toBeGreaterThan(0) // rounding really happened, so the comparison is not vacuous
  })
  it('stays small: under 1 MB', () => {
    expect(Buffer.byteLength(committedText)).toBeLessThan(1_000_000)
  })
})

describe('public/data/index.json', () => {
  const idx = JSON.parse(readFileSync(new URL('../../public/data/index.json', import.meta.url), 'utf8'))
  it('lists the synthetic story, whose file stem equals its id', () => {
    expect(idx.datasets).toEqual([{ id: 'synthetic-regime-story', title: committed.title, file: 'synthetic-regime-story.json' }])
    expect(committed.id).toBe('synthetic-regime-story')
  })
})
