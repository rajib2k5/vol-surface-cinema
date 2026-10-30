import { describe, expect, it } from 'vitest'
import { parseSequence, parseSequenceJson, parseIndex, type ContractError } from './contract.ts'

function valid(): Record<string, any> {
  return {
    schema: 'vol-surface-cinema/surface-sequence',
    schema_version: 1,
    id: 'tiny-demo',
    title: 'Tiny demo',
    badge: 'Synthetic data',
    synthetic: true,
    grid: { k: [-0.1, 0.1], dte: [7, 30] },
    frames: [
      { date: '2030-01-02', iv: [[0.2, 0.21], [0.22, 0.23]] },
      { date: '2030-01-03', iv: [[0.25, 0.26], [0.27, 0.28]], label: 'second' },
    ],
    events: [{ date: '2030-01-03', label: 'Something happened', kind: 'shock' }],
    source: { kind: 'synthetic', notice: 'made up', generator: { script: 'x.ts', seed: 1 } },
    licence: 'MIT',
  }
}
const errs = (raw: unknown): ContractError[] => {
  const r = parseSequence(raw)
  if (r.ok) throw new Error('expected failure but parsed ok')
  return r.errors
}
const paths = (raw: unknown) => errs(raw).map((e) => e.path)

describe('parseSequence: accepts', () => {
  it('a valid sequence, returning the same data', () => {
    const raw = valid()
    const r = parseSequence(raw)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.frames[1].iv[1][1]).toBe(0.28)
  })
  it('unknown extra keys', () => {
    const raw = valid()
    raw.something_new = { a: 1 }
    raw.frames[0].extra = 'x'
    expect(parseSequence(raw).ok).toBe(true)
  })
  it('optional playback, display, cell_flags and quoted_share when well formed', () => {
    const raw = valid()
    raw.playback = { fps: 30, hold_s: 1, transition_s: 2, easing: 'easeInOutCubic', loop: false }
    raw.display = { iv_range: [0.1, 0.9], orbit_turns: 1 }
    raw.frames[0].cell_flags = [[0, 1], [0, 0]]
    raw.frames[0].quoted_share = 0.75
    expect(parseSequence(raw).ok).toBe(true)
  })
  it('an empty events list', () => {
    const raw = valid()
    raw.events = []
    expect(parseSequence(raw).ok).toBe(true)
  })
})

describe('parseSequence: rejects with a path', () => {
  it('a non-object', () => {
    expect(paths(null)).toEqual([''])
    expect(paths([1])).toEqual([''])
    expect(paths('x')).toEqual([''])
  })
  it('a wrong schema name', () => {
    const raw = valid()
    raw.schema = 'other'
    expect(paths(raw)).toContain('schema')
  })
  it('an unknown schema_version, telling the user to upgrade', () => {
    const raw = valid()
    raw.schema_version = 2
    const e = errs(raw).find((x) => x.path === 'schema_version')
    expect(e?.message).toContain('upgrade vol-surface-cinema')
  })
  it.each(['Has Caps', 'a/b', '', 'x'.repeat(65), 'under_score'])('a bad id %j', (id) => {
    const raw = valid()
    raw.id = id
    expect(paths(raw)).toContain('id')
  })
  it('a missing title and a non-boolean synthetic', () => {
    const raw = valid()
    delete raw.title
    raw.synthetic = 'yes'
    expect(paths(raw)).toEqual(expect.arrayContaining(['title', 'synthetic']))
  })
  it('a grid axis that is not strictly increasing, too short, or has a non-integer dte', () => {
    let raw = valid()
    raw.grid.k = [0.1, 0.1]
    expect(paths(raw)).toContain('grid.k')
    raw = valid()
    raw.grid.k = [0.1]
    expect(paths(raw)).toContain('grid.k')
    raw = valid()
    raw.grid.dte = [7, 30.5]
    expect(paths(raw)).toContain('grid.dte[1]')
    raw = valid()
    raw.grid.dte = [0, 30]
    expect(paths(raw)).toContain('grid.dte[0]')
  })
  it('no frames, and too many frames', () => {
    const raw = valid()
    raw.frames = []
    expect(paths(raw)).toContain('frames')
    const many = valid()
    many.frames = Array.from({ length: 10_001 }, (_, i) => ({ date: new Date(Date.UTC(2030, 0, 1 + i)).toISOString().slice(0, 10), iv: [[0.2, 0.2], [0.2, 0.2]] }))
    expect(paths(many)).toContain('frames')
  })
  it('dates that are not strictly increasing', () => {
    const raw = valid()
    raw.frames[1].date = '2030-01-02'
    expect(paths(raw)).toContain('frames[1].date')
  })
  it('a date that is not a real calendar date', () => {
    const raw = valid()
    raw.frames[1].date = '2030-02-30'
    expect(paths(raw)).toContain('frames[1].date')
    raw.frames[1].date = '2030/02/03'
    expect(paths(raw)).toContain('frames[1].date')
  })
  it('the row count and the row length of an iv grid', () => {
    let raw = valid()
    raw.frames[1].iv = [[0.2, 0.2]]
    expect(paths(raw)).toContain('frames[1].iv')
    raw = valid()
    raw.frames[1].iv[1] = [0.2]
    expect(paths(raw)).toContain('frames[1].iv[1]')
  })
  it('names the exact cell of a bad IV: frames[3].iv[2][5]', () => {
    const raw = valid()
    raw.grid.k = [-0.2, -0.1, 0, 0.1, 0.2, 0.3]
    raw.grid.dte = [7, 14, 30]
    raw.frames = [0, 1, 2, 3].map((n) => ({
      date: `2030-01-0${n + 2}`,
      iv: [0, 1, 2].map(() => [0.2, 0.2, 0.2, 0.2, 0.2, 0.2]),
    }))
    raw.frames[3].iv[2][5] = 7
    raw.events = []
    expect(paths(raw)).toEqual(['frames[3].iv[2][5]'])
  })
  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['null', null],
    ['zero', 0],
    ['negative', -0.1],
    ['5 exactly', 5],
    ['above 5', 6],
    ['a string', '0.2'],
  ])('an IV that is %s', (_name, value) => {
    const raw = valid()
    raw.frames[0].iv[0][1] = value
    expect(paths(raw)).toEqual(['frames[0].iv[0][1]'])
  })
  it('an event whose date is not a frame date', () => {
    const raw = valid()
    raw.events[0].date = '2030-01-09'
    expect(paths(raw)).toContain('events[0].date')
  })
  it('a bad event kind, empty label and negative hold', () => {
    const raw = valid()
    raw.events[0] = { date: '2030-01-03', label: '', kind: 'weird', hold_s: -1 }
    expect(paths(raw)).toEqual(expect.arrayContaining(['events[0].label', 'events[0].kind', 'events[0].hold_s']))
  })
  it('bad playback values', () => {
    const raw = valid()
    raw.playback = { fps: 0, hold_s: -1, transition_s: 'x', easing: 'bounce', loop: 'yes' }
    expect(paths(raw)).toEqual(
      expect.arrayContaining(['playback.fps', 'playback.hold_s', 'playback.transition_s', 'playback.easing', 'playback.loop']),
    )
  })
  it('bad display values', () => {
    const raw = valid()
    raw.display = { iv_range: [0.5, 0.5], orbit_turns: 1.5 }
    expect(paths(raw)).toEqual(expect.arrayContaining(['display.iv_range', 'display.orbit_turns']))
  })
  it('a cell_flags grid of the wrong shape, and a quoted_share outside [0, 1]', () => {
    const raw = valid()
    raw.frames[0].cell_flags = [[0, 1]]
    raw.frames[0].quoted_share = 1.5
    expect(paths(raw)).toEqual(expect.arrayContaining(['frames[0].cell_flags', 'frames[0].quoted_share']))
  })
  it('a bad source and licence', () => {
    const raw = valid()
    raw.source = { kind: 'magic', notice: 3 }
    delete raw.licence
    expect(paths(raw)).toEqual(expect.arrayContaining(['source.kind', 'source.notice', 'licence']))
  })
  it('collects at most 50 errors', () => {
    const raw = valid()
    raw.grid = { k: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], dte: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }
    raw.frames = [{ date: '2030-01-02', iv: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => -1)) }]
    raw.events = []
    expect(errs(raw)).toHaveLength(50)
  })
})

describe('parseSequenceJson', () => {
  it('reports a JSON syntax error (e.g. a bare NaN token from Python) as a parse error', () => {
    const r = parseSequenceJson('{"iv": [NaN]}')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors[0].path).toBe('')
      expect(r.errors[0].message).toMatch(/not valid JSON/)
    }
  })
  it('parses valid text', () => {
    expect(parseSequenceJson(JSON.stringify(valid())).ok).toBe(true)
  })
})

describe('parseIndex', () => {
  const idx = { datasets: [{ id: 'synthetic-regime-story', title: 'Synthetic story', file: 'synthetic-regime-story.json' }] }
  it('accepts a list of {id, title, file}', () => {
    const r = parseIndex(idx)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value[0].id).toBe('synthetic-regime-story')
  })
  it('rejects a file that could point anywhere else (path separators, absolute URL, parent dir)', () => {
    for (const file of ['../x.json', 'https://evil.example/x.json', '/etc/passwd', 'a/b.json', 'x.txt']) {
      expect(parseIndex({ datasets: [{ id: 'a', title: 't', file }] }).ok, file).toBe(false)
    }
  })
  it('rejects a bad id, a missing datasets list and an empty list', () => {
    expect(parseIndex({ datasets: [{ id: 'A B', title: 't', file: 'a.json' }] }).ok).toBe(false)
    expect(parseIndex({}).ok).toBe(false)
    expect(parseIndex({ datasets: [] }).ok).toBe(false)
  })
})
