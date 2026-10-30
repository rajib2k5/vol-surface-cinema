import { describe, expect, it } from 'vitest'
import { loadDataset, DatasetError } from './dataset.ts'

const seq = {
  schema: 'vol-surface-cinema/surface-sequence',
  schema_version: 1,
  id: 'tiny',
  title: 'Tiny',
  badge: 'Synthetic',
  synthetic: true,
  grid: { k: [-0.1, 0.1], dte: [7, 30] },
  frames: [{ date: '2030-01-02', iv: [[0.2, 0.21], [0.22, 0.23]] }],
  events: [],
  source: { kind: 'synthetic', notice: 'n' },
  licence: 'MIT',
}
const index = { datasets: [{ id: 'tiny', title: 'Tiny', file: 'tiny.json' }] }

/** A fake fetch answering from a table of url -> {status, body}; records every URL asked for. */
function fakeFetch(table: Record<string, { status?: number; body: string }>, asked: string[] = []) {
  const f = async (url: string) => {
    asked.push(url)
    const hit = table[url]
    if (!hit) throw new TypeError('network down')
    const status = hit.status ?? 200
    return { ok: status >= 200 && status < 300, status, text: async () => hit.body } as Response
  }
  return f as unknown as typeof fetch
}

describe('loadDataset', () => {
  it('loads index.json, then the one file the index names for the id', async () => {
    const asked: string[] = []
    const f = fakeFetch({ './data/index.json': { body: JSON.stringify(index) }, './data/tiny.json': { body: JSON.stringify(seq) } }, asked)
    const { sequence, index: idx } = await loadDataset('tiny', f, './data/')
    expect(sequence.id).toBe('tiny')
    expect(idx).toHaveLength(1)
    expect(asked).toEqual(['./data/index.json', './data/tiny.json'])
  })
  it('defaults to the first dataset when no id is given', async () => {
    const f = fakeFetch({ './data/index.json': { body: JSON.stringify(index) }, './data/tiny.json': { body: JSON.stringify(seq) } })
    expect((await loadDataset(null, f, './data/')).sequence.id).toBe('tiny')
  })
  it('refuses an id that is not in the index and never fetches it', async () => {
    const asked: string[] = []
    const f = fakeFetch({ './data/index.json': { body: JSON.stringify(index) } }, asked)
    await expect(loadDataset('../../etc/passwd', f, './data/')).rejects.toThrow(/not in index\.json/)
    expect(asked).toEqual(['./data/index.json'])
  })
  it('a 404 names the URL and the status', async () => {
    const f = fakeFetch({ './data/index.json': { body: JSON.stringify(index) }, './data/tiny.json': { status: 404, body: 'nope' } })
    const err = await loadDataset('tiny', f, './data/').catch((e) => e)
    expect(err).toBeInstanceOf(DatasetError)
    expect(err.message).toContain('./data/tiny.json')
    expect(err.message).toContain('404')
  })
  it('a network error names the URL', async () => {
    const f = fakeFetch({})
    const err = await loadDataset('tiny', f, './data/').catch((e) => e)
    expect(err).toBeInstanceOf(DatasetError)
    expect(err.message).toContain('./data/index.json')
  })
  it('a contract violation carries the path list, capped at 10 in the message', async () => {
    const bad = { ...seq, frames: [{ date: '2030-01-02', iv: [[0, 0], [0, 0]] }] }
    const f = fakeFetch({ './data/index.json': { body: JSON.stringify(index) }, './data/tiny.json': { body: JSON.stringify(bad) } })
    const err = (await loadDataset('tiny', f, './data/').catch((e) => e)) as DatasetError
    expect(err).toBeInstanceOf(DatasetError)
    expect(err.errors.map((e) => e.path)).toContain('frames[0].iv[0][0]')
    expect(err.errors.length).toBeLessThanOrEqual(10)
  })
  it('a file whose id differs from the index entry is rejected', async () => {
    const f = fakeFetch({ './data/index.json': { body: JSON.stringify(index) }, './data/tiny.json': { body: JSON.stringify({ ...seq, id: 'other' }) } })
    await expect(loadDataset('tiny', f, './data/')).rejects.toThrow(/id/)
  })
})
