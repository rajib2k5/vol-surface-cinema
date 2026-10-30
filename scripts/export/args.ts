/** Pure validation of the export CLI's arguments. Every violation is exit code 2. The filesystem is injected. */
import path from 'node:path'
import { defaultSize, extensionFor, type Format } from './paths.ts'

export interface ExportArgs {
  format: Format
  dataset: string | null
  /** The --fps value, or null. Resolve with resolveFps once the sequence's playback.fps is known. */
  fps: number | null
  size: { width: number; height: number }
  /** Absolute. */
  out: string
  force: boolean
  maxFrames: number
  gpu: boolean
}

export interface ArgsContext {
  cwd: string
  exists: (p: string) => boolean
  dirExists: (p: string) => boolean
}

export type ArgsResult = { ok: true; value: ExportArgs } | { ok: false; message: string }

const FORMATS: readonly string[] = ['gif', 'mp4', 'frames-json']
const GIF_FPS = [10, 20, 25, 50]
const VALUE_FLAGS = ['format', 'dataset', 'fps', 'size', 'out', 'max-frames']
const BOOL_FLAGS = ['force', 'gpu']
const ID_RE = /^[a-z0-9-]{1,64}$/

const fail = (message: string): ArgsResult => ({ ok: false, message })

function intIn(text: string, lo: number, hi: number): number | null {
  if (!/^\d+$/.test(text)) return null
  const n = Number(text)
  return n >= lo && n <= hi ? n : null
}

export function parseArgs(argv: readonly string[], ctx: ArgsContext): ArgsResult {
  const values = new Map<string, string>()
  const flags = new Set<string>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) return fail(`unexpected argument "${arg}"`)
    const eq = arg.indexOf('=')
    const name = arg.slice(2, eq === -1 ? undefined : eq)
    if (BOOL_FLAGS.includes(name)) {
      if (eq !== -1) return fail(`--${name} takes no value`)
      flags.add(name)
    } else if (VALUE_FLAGS.includes(name)) {
      let value: string | undefined
      if (eq !== -1) value = arg.slice(eq + 1)
      else {
        value = argv[i + 1]
        i++
      }
      if (value === undefined || (eq === -1 && value.startsWith('--'))) return fail(`--${name} needs a value`)
      values.set(name, value)
    } else {
      return fail(`unknown option "${arg}"`)
    }
  }

  const format = values.get('format')
  if (format === undefined || !FORMATS.includes(format)) return fail(`--format must be one of ${FORMATS.join(', ')}`)
  const fmt = format as Format

  let dataset: string | null = null
  if (values.has('dataset')) {
    dataset = values.get('dataset') as string
    if (!ID_RE.test(dataset)) return fail('--dataset must be a plain id like "synthetic-regime-story" (a-z, 0-9, -)')
  }

  let fps: number | null = null
  if (values.has('fps')) {
    fps = intIn(values.get('fps') as string, 1, 60)
    if (fps === null) return fail('--fps must be an integer in 1..60')
    if (fmt === 'gif' && !GIF_FPS.includes(fps)) return fail(`--fps for gif must be one of ${GIF_FPS.join(', ')} (GIF delays are centiseconds)`)
  }

  let size = defaultSize(fmt)
  if (values.has('size')) {
    const m = /^(\d+)x(\d+)$/.exec(values.get('size') as string)
    const w = m ? intIn(m[1], 16, 4096) : null
    const h = m ? intIn(m[2], 16, 4096) : null
    if (w === null || h === null || w % 2 !== 0 || h % 2 !== 0) return fail('--size must be WxH with each side an even number in 16..4096')
    size = { width: w, height: h }
  }

  let maxFrames = 10_000
  if (values.has('max-frames')) {
    const m = intIn(values.get('max-frames') as string, 1, Number.MAX_SAFE_INTEGER)
    if (m === null) return fail('--max-frames must be an integer >= 1')
    maxFrames = m
  }

  const rawOut = values.get('out')
  if (rawOut === undefined || rawOut === '') return fail('--out is required')
  const out = path.resolve(ctx.cwd, rawOut)
  const ext = extensionFor(fmt)
  if (path.extname(out).toLowerCase() !== ext) return fail(`--out must end in ${ext} for --format ${fmt}`)
  if (!ctx.dirExists(path.dirname(out))) return fail(`the directory ${path.dirname(out)} does not exist`)
  const force = flags.has('force')
  if (!force && ctx.exists(out)) return fail(`${out} already exists (use --force to overwrite)`)

  return { ok: true, value: { format: fmt, dataset, fps, size, out, force, maxFrames, gpu: flags.has('gpu') } }
}

/** fps precedence: --fps, then playback.fps, then 30. GIF without --fps is 25 (a divisor of 100). */
export function resolveFps(format: Format, cliFps: number | null, playbackFps: number | undefined): number {
  if (cliFps !== null) return cliFps
  if (format === 'gif') return 25
  return playbackFps ?? 30
}

/** null when ok, else the exit-2 message. */
export function checkFrameCount(total: number, maxFrames: number): string | null {
  return total <= maxFrames ? null : `the sequence has ${total} frames, over --max-frames ${maxFrames}`
}
