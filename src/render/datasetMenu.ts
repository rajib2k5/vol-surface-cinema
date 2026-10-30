/** The dataset menu: one option per index.json entry. Choosing one navigates to its ?dataset= link (a reload). */
import type { IndexEntry } from '../lib/contract.ts'
import { datasetHref } from '../lib/query.ts'

export function createDatasetMenu(host: HTMLElement, index: readonly IndexEntry[], currentId: string, navigate: (href: string) => void): void {
  const label = document.createElement('label')
  label.className = 'dataset'
  label.append('Dataset ')
  const select = document.createElement('select')
  select.setAttribute('aria-label', 'Dataset')
  for (const entry of index) {
    const option = document.createElement('option')
    option.value = entry.id
    option.textContent = entry.title
    select.appendChild(option)
  }
  select.value = currentId
  select.addEventListener('change', () => navigate(datasetHref(select.value)))
  label.appendChild(select)
  host.appendChild(label)
}
