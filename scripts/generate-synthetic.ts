// Writes public/data/synthetic-regime-story.json and its entry in public/data/index.json. The only writer of that file.
// Other datasets' entries in index.json are kept (the real dataset has its own import script).
import { readFileSync, writeFileSync } from 'node:fs'
import { generate, serialize } from '../src/synth/generate.ts'
import { upsertDataset } from './lib/indexFile.ts'

const doc = generate()
const dataDir = new URL('../public/data/', import.meta.url)
writeFileSync(new URL(`${doc.id}.json`, dataDir), serialize(doc))
let existing: string | null = null
try {
  existing = readFileSync(new URL('index.json', dataDir), 'utf8')
} catch {
  existing = null
}
writeFileSync(new URL('index.json', dataDir), upsertDataset(existing, { id: doc.id, title: doc.title, file: `${doc.id}.json` }, 'first'))
console.log(`wrote ${doc.id}.json (${doc.frames.length} frames) and its index.json entry`)
