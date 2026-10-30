/** The ffmpeg argv for each format. PNG frames arrive on stdin; output goes to `partial`, a file this run created itself (partial.ts). Never joined into a shell string. */
import type { Format } from './paths.ts'

export interface FfmpegSpec {
  format: Format
  fps: number
  /** The temporary output, already created by this run (reservePartial). */
  partial: string
}

export function ffmpegArgs({ format, fps, partial }: FfmpegSpec): string[] {
  // -y is safe: `partial` was created exclusively by this run, so it is never a user's file. Without it ffmpeg would stop and ask about the empty file.
  const head = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-']
  if (format === 'mp4') {
    return [...head, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', partial]
  }
  if (format === 'gif') {
    return [...head, '-filter_complex', '[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5', '-loop', '0', partial]
  }
  throw new Error('frames-json has no ffmpeg step')
}
