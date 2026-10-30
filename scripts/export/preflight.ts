/** Checks run before any browser starts. Failures are exit code 3 (checkDatasetKnown has its own code). Process and filesystem access are injected. */

import { parseIndex } from '../../src/lib/contract.ts'

export type Check = { ok: true } | { ok: false; message: string }

export function ffmpegCommand(env: Record<string, string | undefined>): string {
  return env.FFMPEG ? env.FFMPEG : 'ffmpeg'
}

export function checkFfmpeg(cmd: string, run: (cmd: string, args: string[]) => { status: number | null; error?: Error | undefined }): Check {
  const r = run(cmd, ['-version'])
  if (r.error || r.status !== 0) {
    return {
      ok: false,
      message: `ffmpeg was not found or did not run ("${cmd} -version"). Install ffmpeg with your package manager, or set the FFMPEG environment variable to its path.`,
    }
  }
  return { ok: true }
}

export function checkBrowser(executablePath: string, exists: (p: string) => boolean): Check {
  if (!exists(executablePath)) {
    return { ok: false, message: `Playwright's chromium is not installed (looked for ${executablePath}). Run: npx playwright install chromium` }
  }
  return { ok: true }
}

/** A --dataset id must be in index.json: an unknown one is a usage error (2) found before Chromium starts. A bad or missing index is 4. */
export function checkDatasetKnown(dataset: string | null, indexText: string | null): { ok: true } | { ok: false; code: 2 | 4; message: string } {
  if (indexText === null) return { ok: false, code: 4, message: 'public/data/index.json could not be read. Run `npm run gen:data` first.' }
  let raw: unknown
  try {
    raw = JSON.parse(indexText)
  } catch (e) {
    return { ok: false, code: 4, message: `index.json is not valid JSON: ${(e as Error).message}` }
  }
  const index = parseIndex(raw)
  if (!index.ok) return { ok: false, code: 4, message: `index.json is invalid: ${index.errors[0].path}: ${index.errors[0].message}` }
  if (dataset !== null && !index.value.some((e) => e.id === dataset)) {
    return { ok: false, code: 2, message: `dataset "${dataset}" is not in index.json (known: ${index.value.map((e) => e.id).join(', ')})` }
  }
  return { ok: true }
}
