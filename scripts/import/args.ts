/** Pure validation of the import script's arguments. The filesystem is injected. Any violation exits 2. */
import path from 'node:path'

export const MAX_INPUT_BYTES = 2_000_000

export interface FileInfo {
  isFile: boolean
  isSymlink: boolean
  size: number
}

export interface ImportFs {
  /** lstat semantics (does not follow a symlink); null when the path does not exist. */
  stat(p: string): FileInfo | null
}

export type ImportArgsResult = { ok: true; value: { input: string } } | { ok: false; message: string }

const fail = (message: string): ImportArgsResult => ({ ok: false, message })

export function parseImportArgs(argv: readonly string[], ctx: { cwd: string; fs: ImportFs }): ImportArgsResult {
  let rawIn: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--in' || arg.startsWith('--in=')) {
      if (arg === '--in') {
        rawIn = argv[++i]
        if (rawIn === undefined || rawIn.startsWith('--')) return fail('--in needs a value')
      } else rawIn = arg.slice('--in='.length)
    } else if (arg.startsWith('--')) return fail(`unknown option "${arg}"`)
    else return fail(`unexpected argument "${arg}"`)
  }
  if (rawIn === undefined || rawIn === '') return fail('--in <path to surface_frames.json> is required')
  const input = path.resolve(ctx.cwd, rawIn)
  if (path.extname(input).toLowerCase() !== '.json') return fail('--in must be a .json file')
  const info = ctx.fs.stat(input)
  if (!info) return fail(`${input} does not exist`)
  if (info.isSymlink) return fail(`${input} is a symbolic link; pass the real file`)
  if (!info.isFile) return fail(`${input} is not a regular file`)
  if (info.size > MAX_INPUT_BYTES) return fail(`${input} is too large (${info.size} bytes, limit ${MAX_INPUT_BYTES})`)
  return { ok: true, value: { input } }
}
