import { describe, expect, it } from 'vitest'
import { upsertDataset } from './indexFile.ts'

const a = { id: 'a-set', title: 'A', file: 'a-set.json' }
const b = { id: 'b-set', title: 'B', file: 'b-set.json' }

describe('upsertDataset', () => {
  it('starts a new index when there is none', () => {
    expect(JSON.parse(upsertDataset(null, a, 'first')).datasets).toEqual([a])
  })
  it('puts a new default dataset first and a new optional one last', () => {
    const text = upsertDataset(upsertDataset(null, b, 'last'), a, 'first')
    expect(JSON.parse(text).datasets.map((d: { id: string }) => d.id)).toEqual(['a-set', 'b-set'])
    const text2 = upsertDataset(upsertDataset(null, a, 'first'), b, 'last')
    expect(JSON.parse(text2).datasets.map((d: { id: string }) => d.id)).toEqual(['a-set', 'b-set'])
  })
  it('replaces an existing entry in place, whatever the position argument says', () => {
    const start = upsertDataset(upsertDataset(null, a, 'first'), b, 'last')
    const renamed = { ...b, title: 'B2' }
    expect(JSON.parse(upsertDataset(start, renamed, 'first')).datasets).toEqual([a, renamed])
  })
  it('is idempotent, ends with a newline and is 2-space indented', () => {
    const once = upsertDataset(upsertDataset(null, a, 'first'), b, 'last')
    expect(upsertDataset(once, b, 'last')).toBe(once)
    expect(once.endsWith('\n')).toBe(true)
    expect(once).toContain('\n  "datasets"')
  })
  it('refuses an index that is not valid, rather than overwriting it', () => {
    expect(() => upsertDataset('{not json', a, 'first')).toThrow(/index/)
    expect(() => upsertDataset('{"datasets": []}', a, 'first')).toThrow(/index/)
  })
  it('refuses an entry whose id or file would not pass the page contract', () => {
    expect(() => upsertDataset(null, { id: '../x', title: 'x', file: 'x.json' }, 'first')).toThrow(/index/)
    expect(() => upsertDataset(null, { id: 'x', title: 'x', file: '../x.json' }, 'first')).toThrow(/index/)
  })
})
