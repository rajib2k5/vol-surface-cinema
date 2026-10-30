import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseIndex, parseSequence } from '../../src/lib/contract.ts'
import { butterflyGridCheck, calendarGridCheck } from '../../src/lib/gridChecks.ts'

const dataUrl = (name: string) => new URL(`../../public/data/${name}`, import.meta.url)
const text = readFileSync(dataUrl('optionsdx-spy-4dates.json'), 'utf8')
const doc = JSON.parse(text)

// The leak test reads the source file's spot and vix_close at test time. This repository holds none of those numbers,
// not even as hashes (short decimals brute-force in a fraction of a second). Fresh clones have no source file: the test skips.
const SOURCE = process.env.VSC_SOURCE_FRAMES ?? '/home/rajib2k5/dev/vol-strategy-backtester/app/public/data/surface_frames.json'
const sourceAvailable = existsSync(SOURCE)
const NUMBER = /\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g
/** Number tokens of `t` as canonical values, so 1234.500 and 1234.5 are the same number. */
const numberTokens = (t: string): number[] => (t.match(NUMBER) ?? []).map(Number)
/** The number tokens of `t` that equal one of `forbidden`. */
const leaks = (t: string, forbidden: ReadonlySet<number>): number[] => numberTokens(t).filter((n) => forbidden.has(n))
function sourceNumbers(): Set<number> {
  const src = JSON.parse(readFileSync(SOURCE, 'utf8')) as { frames: { spot: number; vix_close: number }[] }
  return new Set(src.frames.flatMap((f) => [f.spot, f.vix_close]))
}

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
  it.skipIf(!sourceAvailable)(`holds none of the spot or VIX numbers of the source file (${SOURCE}), as a value or inside any string`, () => {
    const forbidden = sourceNumbers()
    expect(forbidden.size).toBeGreaterThanOrEqual(8) // the source really supplied the numbers
    expect(numberTokens(text).length).toBeGreaterThan(1000) // the scan really covered the grids
    expect(leaks(text, forbidden)).toEqual([])
  })
  it('the leak check can fail: a source value injected into a copy of the text is caught, in any spelling', () => {
    // Control for the test above, with no Cboe or Yahoo number: the "source value" is made up.
    const forbidden = new Set([1234.5, 0.0777])
    expect(leaks(text, forbidden)).toEqual([])
    expect(leaks(`${text} {"note": "close 1234.500"}`, forbidden)).toEqual([1234.5])
    expect(leaks(text.replace(/\]\s*$/, '') + ' 0.0777', forbidden)).toEqual([0.0777])
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
