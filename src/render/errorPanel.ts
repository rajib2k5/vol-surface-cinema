import type { ContractError } from '../lib/contract.ts'

const MAX_SHOWN = 10

/** Replace `host`'s content with an error panel. Everything goes in through textContent. */
export function showError(host: HTMLElement, message: string, errors: readonly ContractError[] = []): void {
  const panel = document.createElement('div')
  panel.className = 'error'
  panel.setAttribute('role', 'alert')
  const h = document.createElement('h2')
  h.textContent = message
  panel.appendChild(h)
  if (errors.length > 0) {
    const ul = document.createElement('ul')
    for (const e of errors.slice(0, MAX_SHOWN)) {
      const li = document.createElement('li')
      li.textContent = `${e.path || '(file)'}: ${e.message}`
      ul.appendChild(li)
    }
    panel.appendChild(ul)
    if (errors.length > MAX_SHOWN) {
      const more = document.createElement('p')
      more.textContent = `and ${errors.length - MAX_SHOWN} more`
      panel.appendChild(more)
    }
  }
  host.replaceChildren(panel)
}
