/** The data notice the page shows under the player. It follows the selected dataset: the text comes from its own `source`. */
import type { Sequence } from './contract.ts'

export function noticeLines(seq: Sequence): string[] {
  const lines = [seq.source.notice]
  for (const p of seq.source.providers ?? []) lines.push(`${p.name}: ${p.role}. Terms: ${p.terms_url} (${p.licence})`)
  lines.push(`Licence: ${seq.licence}`)
  return lines
}
