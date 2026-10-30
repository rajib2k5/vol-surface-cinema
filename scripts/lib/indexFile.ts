/** Pure: add or replace one entry of public/data/index.json, so each data script owns only its own entry. */
import { parseIndex, type IndexEntry } from '../../src/lib/contract.ts'

export function upsertDataset(existing: string | null, entry: IndexEntry, whenNew: 'first' | 'last'): string {
  let datasets: IndexEntry[] = []
  if (existing !== null) {
    let raw: unknown
    try {
      raw = JSON.parse(existing)
    } catch (e) {
      throw new Error(`index.json is not valid JSON, not overwriting it: ${(e as Error).message}`)
    }
    const parsed = parseIndex(raw)
    if (!parsed.ok) throw new Error(`index.json is invalid, not overwriting it: ${parsed.errors[0].path}: ${parsed.errors[0].message}`)
    datasets = parsed.value
  }
  const checked = parseIndex({ datasets: [entry] })
  if (!checked.ok) throw new Error(`index entry is invalid: ${checked.errors[0].path}: ${checked.errors[0].message}`)
  const at = datasets.findIndex((d) => d.id === entry.id)
  if (at >= 0) datasets[at] = entry
  else if (whenNew === 'first') datasets.unshift(entry)
  else datasets.push(entry)
  return JSON.stringify({ datasets }, null, 2) + '\n'
}
