// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createDatasetMenu } from './datasetMenu.ts'
import { showNotice } from './noticePanel.ts'

const index = [
  { id: 'synthetic-regime-story', title: 'Synthetic story', file: 'a.json' },
  { id: 'optionsdx-spy-4dates', title: '<b>Real</b> SPY', file: 'b.json' },
]

describe('createDatasetMenu', () => {
  it('lists every dataset of the index, with the current one selected, titles as plain text', () => {
    const host = document.createElement('div')
    createDatasetMenu(host, index, 'optionsdx-spy-4dates', () => {})
    const options = [...host.querySelectorAll('option')]
    expect(options.map((o) => o.value)).toEqual(['synthetic-regime-story', 'optionsdx-spy-4dates'])
    expect(host.querySelector('select')?.value).toBe('optionsdx-spy-4dates')
    expect(host.querySelector('b')).toBeNull()
    expect(options[1].textContent).toBe('<b>Real</b> SPY')
  })
  it('choosing a dataset navigates to its ?dataset= link', () => {
    const host = document.createElement('div')
    const seen: string[] = []
    createDatasetMenu(host, index, 'synthetic-regime-story', (href) => seen.push(href))
    const select = host.querySelector('select') as HTMLSelectElement
    select.value = 'optionsdx-spy-4dates'
    select.dispatchEvent(new Event('change'))
    expect(seen).toEqual(['?dataset=optionsdx-spy-4dates'])
  })
  it('is labelled for assistive tech', () => {
    const host = document.createElement('div')
    createDatasetMenu(host, index, 'synthetic-regime-story', () => {})
    expect(host.querySelector('select')?.getAttribute('aria-label')).toBe('Dataset')
  })
})

describe('showNotice', () => {
  it('writes one paragraph per line as plain text', () => {
    const host = document.createElement('div')
    showNotice(host, ['one', '<script>x</script>'])
    expect([...host.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['one', '<script>x</script>'])
    expect(host.querySelector('script')).toBeNull()
  })
  it('replaces the previous notice', () => {
    const host = document.createElement('div')
    showNotice(host, ['one'])
    showNotice(host, ['two'])
    expect(host.querySelectorAll('p')).toHaveLength(1)
  })
})
