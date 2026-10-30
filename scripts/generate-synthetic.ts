// Writes public/data/synthetic-regime-story.json and public/data/index.json. The only writer of those files.
import { writeFileSync } from 'node:fs'
import { generate, serialize } from '../src/synth/generate.ts'

const doc = generate()
const dataDir = new URL('../public/data/', import.meta.url)
writeFileSync(new URL(`${doc.id}.json`, dataDir), serialize(doc))
const index = { datasets: [{ id: doc.id, title: doc.title, file: `${doc.id}.json` }] }
writeFileSync(new URL('index.json', dataDir), JSON.stringify(index, null, 2) + '\n')
console.log(`wrote ${doc.id}.json (${doc.frames.length} frames) and index.json`)
