// One-off import of vol-strategy-backtester's surface_frames.json (read only) into
// public/data/optionsdx-spy-4dates.json, plus its entry in public/data/index.json.
//   npm run import:real -- --in /path/to/vol-strategy-backtester/app/public/data/surface_frames.json
// Imports only the IV grid, cell flags, quoted share and run ids. Never spot, vix_close or atm_iv_30d.
// Prints the calendar/butterfly screens it ran. It does not repair the data. Exit 2: bad arguments or input.
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { parseImportArgs } from './import/args.ts'
import { convertFrames, ImportError, OUTPUT_ID } from './import/convert.ts'
import { upsertDataset } from './lib/indexFile.ts'

const MAX_OUTPUT_BYTES = 1_000_000
const dataDir = new URL('../public/data/', import.meta.url)

function main(): number {
  const args = parseImportArgs(process.argv.slice(2), {
    cwd: process.cwd(),
    fs: {
      stat(p) {
        try {
          const s = lstatSync(p)
          return { isFile: s.isFile(), isSymlink: s.isSymbolicLink(), size: s.size }
        } catch {
          return null
        }
      },
    },
  })
  if (!args.ok) {
    console.error(`import: ${args.message}`)
    return 2
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(args.value.input, 'utf8'))
  } catch (e) {
    console.error(`import: ${args.value.input} is not valid JSON: ${(e as Error).message}`)
    return 2
  }
  try {
    const { sequence, report } = convertFrames(raw)
    const text = JSON.stringify(sequence, null, 2) + '\n'
    if (Buffer.byteLength(text) > MAX_OUTPUT_BYTES) throw new ImportError([`output is over ${MAX_OUTPUT_BYTES} bytes`])
    // Fixed output names: nothing the input says can choose where we write.
    writeFileSync(new URL(`${OUTPUT_ID}.json`, dataDir), text)
    let existing: string | null = null
    try {
      existing = readFileSync(new URL('index.json', dataDir), 'utf8')
    } catch {
      existing = null
    }
    writeFileSync(new URL('index.json', dataDir), upsertDataset(existing, { id: sequence.id, title: sequence.title, file: `${OUTPUT_ID}.json` }, 'last'))
    console.log(`wrote ${OUTPUT_ID}.json (${sequence.frames.length} frames, ${Buffer.byteLength(text)} bytes) and its index.json entry`)
    for (const f of report.frames)
      console.log(
        `${f.date}  extrapolated ${((1 - f.quotedShare) * 100).toFixed(1)}%  ` +
          `calendar ${f.calendar.violations}/${f.calendar.cells} (worst ${f.calendar.worst.toExponential(2)})  ` +
          `butterfly ${f.butterfly.violations}/${f.butterfly.cells} (min g ${f.butterfly.min.toFixed(3)})`,
      )
    return 0
  } catch (e) {
    if (e instanceof ImportError) {
      console.error(`import: ${e.message}`)
      return 2
    }
    throw e
  }
}

process.exitCode = main()
