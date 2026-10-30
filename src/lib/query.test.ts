import { describe, expect, it } from 'vitest'
import { datasetHref, datasetProblem, parseQuery } from './query.ts'

describe('parseQuery', () => {
  it('defaults: live mode, no dataset, no overrides', () => {
    expect(parseQuery('')).toEqual({ dataset: null, invalidDataset: null, export: false, width: null, height: null, fps: null })
  })
  it('reads dataset, export, w, h and fps', () => {
    expect(parseQuery('?export=1&dataset=synthetic-regime-story&w=320&h=180&fps=10')).toEqual({
      dataset: 'synthetic-regime-story',
      invalidDataset: null,
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
  it('keeps the raw value of a rejected dataset so the page can name it, and reports none for a valid or absent one', () => {
    expect(parseQuery('?dataset=A%20B')).toMatchObject({ dataset: null, invalidDataset: 'A B' })
    expect(parseQuery('?dataset=')).toMatchObject({ dataset: null, invalidDataset: '' })
    expect(parseQuery('?dataset=ok-1')).toMatchObject({ dataset: 'ok-1', invalidDataset: null })
    expect(parseQuery('?w=320')).toMatchObject({ dataset: null, invalidDataset: null })
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

describe('datasetHref', () => {
  it('builds a ?dataset= link from a plain id', () => {
    expect(datasetHref('optionsdx-spy-4dates')).toBe('?dataset=optionsdx-spy-4dates')
  })
  it('refuses an id that could carry anything else', () => {
    expect(() => datasetHref('a&export=1')).toThrow(RangeError)
    expect(() => datasetHref('../x')).toThrow(RangeError)
    expect(() => datasetHref('')).toThrow(RangeError)
  })
})

describe('datasetProblem', () => {
  it('is null when no dataset was asked for or the id is valid', () => {
    expect(datasetProblem(parseQuery(''))).toBeNull()
    expect(datasetProblem(parseQuery('?dataset=optionsdx-spy-4dates'))).toBeNull()
  })
  it('names the rejected value and the rule', () => {
    const m = datasetProblem(parseQuery('?dataset=Bad%20Id'))
    expect(m).toContain('"Bad Id"')
    expect(m).toMatch(/a-z/)
  })
  it('shows an empty value as an empty string, not as nothing', () => {
    expect(datasetProblem(parseQuery('?dataset='))).toContain('""')
  })
  it('truncates a very long value', () => {
    const m = datasetProblem(parseQuery(`?dataset=${'x'.repeat(5000).toUpperCase()}`)) as string
    expect(m.length).toBeLessThan(300)
  })
})
