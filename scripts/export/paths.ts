/** Pure path helpers for the export CLI. */
import path from 'node:path'

export type Format = 'gif' | 'mp4' | 'frames-json'

export function extensionFor(format: Format): string {
  return format === 'frames-json' ? '.json' : `.${format}`
}

/**
 * /a/demo.mp4 + "7-ab" -> /a/.demo.7-ab.partial.mp4: a hidden file beside the output (same filesystem, so the final rename is atomic)
 * with the real extension (so ffmpeg still sees .mp4 or .gif). The token makes the name one no user file is likely to have;
 * reservePartial (partial.ts) creates it exclusively, so a clash is detected instead of overwritten.
 */
export function partialPath(out: string, token: string): string {
  const ext = path.extname(out)
  const stem = path.basename(out, ext)
  return path.join(path.dirname(out), `.${stem}.${token}.partial${ext}`)
}

export function defaultSize(format: Format): { width: number; height: number } {
  return format === 'gif' ? { width: 800, height: 450 } : { width: 1280, height: 720 }
}
