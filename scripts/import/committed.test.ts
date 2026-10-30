import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseIndex, parseSequence } from '../../src/lib/contract.ts'
import { butterflyGridCheck, calendarGridCheck } from '../../src/lib/gridChecks.ts'

const dataUrl = (name: string) => new URL(`../../public/data/${name}`, import.meta.url)
const text = readFileSync(dataUrl('optionsdx-spy-4dates.json'), 'utf8')
const doc = JSON.parse(text)

// SHA-256 of the shortest decimal text of each spot and VIX close in the source file. They are stored as
// hashes so that this repository holds no Cboe number even in a test. A leak is any number token of the
// committed file (in a value or inside a string) that hashes to one of these.
const FORBIDDEN = new Set([
  '88234b59c5816d49e9b8dd3c02ace2ed0e079c5eff5f148f9d91d70ae5a1029d',
  '1bab76de8ed843496828ec3c3d1517451bd2c245b7042e67ad963382a5ac91ec',
  '62cd0ddf9cd92a77333afd396da9bdb84def5edccc595cf920907f58266b17e3',
  '708acd55076881095f6175e15f6c2367296e5dbb00b2a2497ef0a5d13d91ca85',
  '32953521383c4e3f7424d1a94b0befa46db4a0925e62de6a083bc7339df91115',
  '90b8cf4464aa0cc80023447609621286a0c81b79ce56885749afe54179c2f801',
  'e0ef67a3bb3ef7248ab3dfac82c9fc38277c7b92f481f0dc89054cd11fb9e4ff',
  '6978e2340a8503590a60b7d19aae46c4ea02a62986b91628d06ae0e35b011e0d',
])
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out))
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.add(k)
      keysDeep(x, out)
    }
  return out
}

describe('the committed real dataset (public/data/optionsdx-spy-4dates.json)', () => {
  it('matches the surface-sequence contract, and its file stem is its id', () => {
    const parsed = parseSequence(doc)
    expect(parsed.ok).toBe(true)
    expect(doc.id).toBe('optionsdx-spy-4dates')
    expect(doc.synthetic).toBe(false)
    expect(doc.frames.map((f: { date: string }) => f.date)).toEqual(['2017-11-03', '2018-02-05', '2020-03-16', '2023-06-15'])
  })
  it('holds no spot, vix_close or atm_iv_30d key anywhere', () => {
    const keys = keysDeep(doc)
    for (const banned of ['spot', 'vix_close', 'atm_iv_30d', 'expiries_used']) expect(keys.has(banned)).toBe(false)
    for (const f of doc.frames) expect(Object.keys(f).sort()).toEqual(['cell_flags', 'date', 'iv', 'label', 'quoted_share'])
  })
  it('holds none of the spot or VIX numbers of the source file, as a value or inside any string', () => {
    const tokens = text.match(/\d+(?:\.\d+)?/g) ?? []
    expect(tokens.length).toBeGreaterThan(1000) // the scan really covered the grids
    const leaked = tokens.filter((t) => FORBIDDEN.has(sha(t)))
    expect(leaked).toEqual([])
    expect(FORBIDDEN.size).toBe(8)
  })
  it('the hash check can fail: a known token does hash into the forbidden set', () => {
    // Control for the test above. 14.5 is the VIX close of the last source date.
    expect(FORBIDDEN.has(sha('14.5'))).toBe(true)
    expect(FORBIDDEN.has(sha('0.5'))).toBe(false)
  })
  it('stays small: derived grid values only', () => {
    expect(Buffer.byteLength(text)).toBeLessThan(100_000)
  })
  it('is listed in index.json after the synthetic default', () => {
    const idx = parseIndex(JSON.parse(readFileSync(dataUrl('index.json'), 'utf8')))
    expect(idx.ok && idx.value.map((e) => e.id)).toEqual(['synthetic-regime-story', 'optionsdx-spy-4dates'])
  })

  // Measured on the committed grids, and recorded in DATA.md. Pinned so that DATA.md cannot go stale.
  describe('no-arbitrage screens (report only: the data is shown as exported, never repaired)', () => {
    const { k, dte } = doc.grid
    it('is calendar-monotone in total variance on the grid: 0 violations in 4 x 260 cells', () => {
      const r = doc.frames.map((f: { iv: number[][] }) => calendarGridCheck(f.iv, dte))
      expect(r.map((x: { violations: number }) => x.violations)).toEqual([0, 0, 0, 0])
      expect(r.map((x: { cells: number }) => x.cells)).toEqual([260, 260, 260, 260])
    })
    it('has butterfly violations on the finite-difference screen: 155 of 1056 interior cells', () => {
      const r = doc.frames.map((f: { iv: number[][] }) => butterflyGridCheck(f.iv, k, dte))
      expect(r.map((x: { violations: number }) => x.violations)).toEqual([18, 28, 82, 27])
      expect(r.map((x: { cells: number }) => x.cells)).toEqual([264, 264, 264, 264])
      expect(Math.min(...r.map((x: { min: number }) => x.min))).toBeCloseTo(-10.874, 2)
    })
  })
})
