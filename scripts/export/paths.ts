/** Pure path helpers for the export CLI. */
import path from 'node:path'

export type Format = 'gif' | 'mp4' | 'frames-json'

export function extensionFor(format: Format): string {
  return format === 'frames-json' ? '.json' : `.${format}`
}

/** /a/demo.mp4 -> /a/demo.partial.mp4: ffmpeg still sees the real extension, and a failed run never leaves a file with the final name. */
export function partialPath(out: string): string {
  const ext = path.extname(out)
  return `${out.slice(0, out.length - ext.length)}.partial${ext}`
}

export function defaultSize(format: Format): { width: number; height: number } {
  return format === 'gif' ? { width: 800, height: 450 } : { width: 1280, height: 720 }
}
