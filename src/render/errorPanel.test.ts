// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { showError } from './errorPanel.ts'

describe('showError', () => {
  it('shows the message and one list item per error, at most 10', () => {
    const host = document.createElement('div')
    const errors = Array.from({ length: 14 }, (_, i) => ({ path: `frames[${i}]`, message: 'bad' }))
    showError(host, 'Could not load the dataset', errors)
    expect(host.textContent).toContain('Could not load the dataset')
    expect(host.querySelectorAll('li')).toHaveLength(10)
    expect(host.textContent).toContain('frames[0]: bad')
    expect(host.textContent).toContain('and 4 more')
  })
  it('puts data in textContent only: markup in a path or message never becomes an element', () => {
    const host = document.createElement('div')
    showError(host, '<b>title</b>', [{ path: '<img src=x onerror=alert(1)>', message: '<script>1</script>' }])
    expect(host.querySelector('img')).toBeNull()
    expect(host.querySelector('script')).toBeNull()
    expect(host.querySelector('b')).toBeNull()
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>')
  })
  it('marks the panel as an alert and replaces earlier content', () => {
    const host = document.createElement('div')
    host.textContent = 'old'
    showError(host, 'Oops', [])
    expect(host.textContent).not.toContain('old')
    expect(host.querySelector('[role=alert]')).not.toBeNull()
    expect(host.querySelectorAll('li')).toHaveLength(0)
  })
})
