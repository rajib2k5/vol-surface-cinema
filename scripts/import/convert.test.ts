import { describe, expect, it } from 'vitest'
import { parseSequence } from '../../src/lib/contract.ts'
import { convertFrames, ImportError, OUTPUT_ID } from './convert.ts'

// Made-up numbers throughout. The spot, vix and atm values are invented markers, so a leak is detectable.
const SPOT = [111.11, 222.22, 333.33, 444.44]
const VIX = [12.34, 23.45, 34.56, 45.67]
const DATES = ['2017-11-03', '2018-02-05', '2020-03-16', '2023-06-15']

function rawDoc(): Record<string, any> {
  return {
    schema_version: '0.3.0',
    generated_at: '2026-10-30T04:09:25Z',
    source_commit: '35cb68269034d995e39f17d63bc907f5779ed5b4-dirty',
    run: { run_id: 'pricing-abc123', config_hash: 'a'.repeat(64), data_fingerprint: 'b'.repeat(64), data_source: 'optionsdx', sample_start: '2017-11-03' },
    illustrative: false,
    label: 'SPY surfaces from OptionsDX with VIX 9.99',
    grid_moneyness: [-0.1, 0, 0.1],
    grid_dte: [7, 30],
    frames: DATES.map((date, t) => ({
      date,
      label: `source label VIX ${VIX[t]}`,
      spot: SPOT[t],
      vix_close: VIX[t],
      expiries_used: 20 + t,
      iv: [
        [0.3 + t / 100, 0.2, 0.25],
        [0.28, 0.21, 0.24],
      ],
      cell_flags: [
        [1, 0, 2],
        [0, 0, 3],
      ],
      quoted_share: 0.5 + t / 10,
      atm_iv_30d: 0.21,
    })),
  }
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
function numbersDeep(v: unknown, out: number[] = []): number[] {
  if (typeof v === 'number') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => numbersDeep(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => numbersDeep(x, out))
  return out
}
function stringsDeep(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => stringsDeep(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => stringsDeep(x, out))
  return out
}

describe('convertFrames', () => {
  it('produces a valid surface-sequence v1 document', () => {
    const { sequence } = convertFrames(rawDoc())
    expect(parseSequence(sequence).ok).toBe(true)
    expect(sequence.id).toBe(OUTPUT_ID)
    expect(sequence.synthetic).toBe(false)
    expect(sequence.source.kind).toBe('derived')
    expect(sequence.licence).toBe('see DATA.md')
  })
  it('keeps the grid and, per frame, only date, iv, cell_flags, quoted_share (plus our own label)', () => {
    const raw = rawDoc()
    const { sequence } = convertFrames(raw)
    expect(sequence.grid).toEqual({ k: raw.grid_moneyness, dte: raw.grid_dte })
    sequence.frames.forEach((f, t) => {
      expect(Object.keys(f).sort()).toEqual(['cell_flags', 'date', 'iv', 'label', 'quoted_share'])
      expect(f.date).toBe(raw.frames[t].date)
      expect(f.iv).toEqual(raw.frames[t].iv)
      expect(f.cell_flags).toEqual(raw.frames[t].cell_flags)
      expect(f.quoted_share).toBe(raw.frames[t].quoted_share)
    })
  })
  it('does not import spot, vix_close, atm_iv_30d, expiries_used or any source label, anywhere', () => {
    const { sequence } = convertFrames(rawDoc())
    const keys = keysDeep(sequence)
    for (const banned of ['spot', 'vix_close', 'atm_iv_30d', 'expiries_used', 'generated_at', 'data_source']) expect(keys.has(banned)).toBe(false)
    const nums = numbersDeep(sequence)
    for (const n of [...SPOT, ...VIX, 9.99]) expect(nums).not.toContain(n)
    const text = stringsDeep(sequence).join('\n')
    expect(text).not.toMatch(/VIX/i)
    expect(text).not.toContain('source label')
  })
  it('writes labels and events in words, with no number other than a year', () => {
    const { sequence } = convertFrames(rawDoc())
    const words = [sequence.title, sequence.badge, ...sequence.frames.map((f) => f.label ?? ''), ...sequence.events.map((e) => e.label)]
    for (const s of words) expect(s.replace(/\b(19|20)\d\d\b/g, '')).not.toMatch(/\d/)
    expect(sequence.frames.map((f) => f.label)).toEqual(['calm, late 2017', 'February 2018 volatility spike', 'March 2020 crash', 'mid-2023'])
    expect(sequence.events.map((e) => [e.date, e.label, e.kind])).toEqual([
      ['2018-02-05', 'February 2018 volatility spike', 'shock'],
      ['2020-03-16', 'March 2020 crash', 'shock'],
      ['2023-06-15', 'Mid-2023', 'note'],
    ])
  })
  it('records the run ids and the source commit, and names every provider with its terms', () => {
    const { sequence } = convertFrames(rawDoc())
    expect(sequence.source.source_commit).toBe('35cb68269034d995e39f17d63bc907f5779ed5b4-dirty')
    expect(sequence.source.run).toEqual({ run_id: 'pricing-abc123', config_hash: 'a'.repeat(64), data_fingerprint: 'b'.repeat(64) })
    const providers = sequence.source.providers ?? []
    expect(providers.map((p) => p.name).join(' ')).toMatch(/OptionsDX/)
    expect(providers.map((p) => p.name).join(' ')).toMatch(/vol-strategy-backtester/)
    for (const p of providers) expect(p.terms_url).toMatch(/^https:\/\//)
    expect(sequence.source.notice).toMatch(/OptionsDX/)
    expect(sequence.source.notice).toMatch(/not covered by this repository's MIT licence/)
  })
  it('sets the real-data playback: 30 fps, 1 s hold, 2 s transitions, no loop', () => {
    expect(convertFrames(rawDoc()).sequence.playback).toEqual({ fps: 30, hold_s: 1, transition_s: 2, easing: 'smoothstep', loop: false })
  })
  it('badge says the data is derived and in-between frames are interpolated', () => {
    expect(convertFrames(rawDoc()).sequence.badge).toBe('SPY implied vols derived from OptionsDX quotes (via Kaggle). Interpolated between dates.')
  })
  it('reports the calendar and butterfly screens it ran', () => {
    const { report } = convertFrames(rawDoc())
    expect(report.frames).toHaveLength(4)
    expect(report.frames[0]).toMatchObject({ date: '2017-11-03', calendar: { violations: expect.any(Number) }, butterfly: { cells: 2 } })
  })
  it('is deterministic', () => {
    expect(JSON.stringify(convertFrames(rawDoc()).sequence)).toBe(JSON.stringify(convertFrames(rawDoc()).sequence))
  })

  describe('rejects bad input with an ImportError and never a partial result', () => {
    const cases: [string, (d: Record<string, any>) => unknown][] = [
      ['a non-object', () => 42],
      ['a missing grid_moneyness', (d) => (delete d.grid_moneyness, d)],
      ['a missing frames list', (d) => (delete d.frames, d)],
      ['not exactly the 4 known dates', (d) => ((d.frames = d.frames.slice(0, 3)), d)],
      ['an unknown date', (d) => ((d.frames[1].date = '2019-01-02'), d)],
      ['a ragged iv row', (d) => (d.frames[0].iv[1].pop(), d)],
      ['a null iv cell (NaN written by Python)', (d) => ((d.frames[2].iv[0][1] = null), d)],
      ['an iv of 5 or more', (d) => ((d.frames[2].iv[0][1] = 5), d)],
      ['an iv of 0', (d) => ((d.frames[2].iv[0][1] = 0), d)],
      ['cell_flags of the wrong shape', (d) => (d.frames[0].cell_flags.pop(), d)],
      ['a quoted_share above 1', (d) => ((d.frames[0].quoted_share = 1.5), d)],
      ['a run id with odd characters', (d) => ((d.run.run_id = 'x; rm -rf /'), d)],
      ['a missing run object', (d) => (delete d.run, d)],
      ['a source_commit that is not a hex hash', (d) => ((d.source_commit = '../../etc'), d)],
      ['an unsorted grid', (d) => ((d.grid_dte = [30, 7]), d)],
    ]
    for (const [name, mutate] of cases)
      it(name, () => {
        expect(() => convertFrames(mutate(rawDoc()))).toThrow(ImportError)
      })
  })
})
