/** The ffmpeg argv for each format. PNG frames arrive on stdin; output goes to the .partial path. Never joined into a shell string. */
import { partialPath, type Format } from './paths.ts'

export interface FfmpegSpec {
  format: Format
  fps: number
  out: string
}

export function ffmpegArgs({ format, fps, out }: FfmpegSpec): string[] {
  // -y so a .partial file left by a crashed run cannot make ffmpeg stop and ask on a closed terminal.
  const head = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-']
  const partial = partialPath(out)
  if (format === 'mp4') {
    return [...head, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', partial]
  }
  if (format === 'gif') {
    return [...head, '-filter_complex', '[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5', '-loop', '0', partial]
  }
  throw new Error('frames-json has no ffmpeg step')
}
