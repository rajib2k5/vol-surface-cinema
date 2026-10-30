import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSequence, type Sequence } from './contract.ts'
import { noticeLines } from './notice.ts'

const load = (name: string): Sequence => {
  const r = parseSequence(JSON.parse(readFileSync(new URL(`../../public/data/${name}.json`, import.meta.url), 'utf8')))
  if (!r.ok) throw new Error('committed dataset is invalid')
  return r.value
}
const synthetic = load('synthetic-regime-story')
const real = load('optionsdx-spy-4dates')

describe('noticeLines (the in-page data notice follows the selected dataset)', () => {
  it('synthetic: says it is made up, generated here, MIT', () => {
    const text = noticeLines(synthetic).join(' ')
    expect(text).toMatch(/not market data/i)
    expect(text).toMatch(/MIT/)
    expect(text).not.toMatch(/OptionsDX/)
  })
  it('real: names OptionsDX and Kaggle, says it is not covered by the MIT licence, and points at DATA.md', () => {
    const text = noticeLines(real).join(' ')
    expect(text).toMatch(/OptionsDX/)
    expect(text).toMatch(/Kaggle/)
    expect(text).toMatch(/not covered by this repository's MIT licence/)
    expect(text).toMatch(/DATA\.md/)
    expect(text).not.toMatch(/not market data/i)
  })
  it('is different for the two datasets', () => {
    expect(noticeLines(real)).not.toEqual(noticeLines(synthetic))
  })
  it('lists each provider with its licence and terms link when the dataset has them', () => {
    const lines = noticeLines(real).join('\n')
    for (const p of real.source.providers ?? []) {
      expect(lines).toContain(p.name)
      expect(lines).toContain(p.terms_url)
    }
  })
  it('always ends with the licence line', () => {
    expect(noticeLines(synthetic).at(-1)).toBe('Licence: MIT')
    expect(noticeLines(real).at(-1)).toBe('Licence: see DATA.md')
  })
})
