import { describe, expect, it } from 'vitest'
import { parseQuery } from './query.ts'

describe('parseQuery', () => {
  it('defaults: live mode, no dataset, no overrides', () => {
    expect(parseQuery('')).toEqual({ dataset: null, export: false, width: null, height: null, fps: null })
  })
  it('reads dataset, export, w, h and fps', () => {
    expect(parseQuery('?export=1&dataset=synthetic-regime-story&w=320&h=180&fps=10')).toEqual({
      dataset: 'synthetic-regime-story',
      export: true,
      width: 320,
      height: 180,
      fps: 10,
    })
  })
  it('export is on only for the exact value 1', () => {
    expect(parseQuery('?export=0').export).toBe(false)
    expect(parseQuery('?export=true').export).toBe(false)
  })
  it('ignores a dataset that is not a plain id (path tricks, URLs), so it can never be fetched', () => {
    for (const bad of ['../x', 'https://evil.example/a', 'A B', 'a/b', '']) {
      expect(parseQuery(`?dataset=${encodeURIComponent(bad)}`).dataset, bad).toBeNull()
    }
  })
  it('ignores sizes outside 16..4096 and non-integers, and fps outside 1..60', () => {
    expect(parseQuery('?w=15&h=4097')).toMatchObject({ width: null, height: null })
    expect(parseQuery('?w=320.5&h=abc')).toMatchObject({ width: null, height: null })
    expect(parseQuery('?w=16&h=4096')).toMatchObject({ width: 16, height: 4096 })
    expect(parseQuery('?fps=0')).toMatchObject({ fps: null })
    expect(parseQuery('?fps=61')).toMatchObject({ fps: null })
    expect(parseQuery('?fps=60')).toMatchObject({ fps: 60 })
  })
})
