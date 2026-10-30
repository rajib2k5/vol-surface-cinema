import { describe, expect, it } from 'vitest'
import { ffmpegArgs } from './ffmpegArgs.ts'
import { extensionFor, partialPath } from './paths.ts'

describe('partialPath / extensionFor', () => {
  it('inserts .partial before the extension so ffmpeg still sees .mp4 / .gif', () => {
    expect(partialPath('/a/b/demo.mp4')).toBe('/a/b/demo.partial.mp4')
    expect(partialPath('/a/b.c/demo.gif')).toBe('/a/b.c/demo.partial.gif')
  })
  it('extension per format', () => {
    expect(extensionFor('mp4')).toBe('.mp4')
    expect(extensionFor('gif')).toBe('.gif')
    expect(extensionFor('frames-json')).toBe('.json')
  })
})

describe('ffmpegArgs', () => {
  it('mp4: H.264 yuv420p crf 18 preset slow faststart, PNG frames from stdin, writing the .partial file', () => {
    expect(ffmpegArgs({ format: 'mp4', fps: 30, out: '/o/demo.mp4' })).toEqual([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart',
      '/o/demo.partial.mp4',
    ])
  })
  it('gif: one-pass palettegen/paletteuse with bayer dither, infinite loop', () => {
    expect(ffmpegArgs({ format: 'gif', fps: 25, out: '/o/demo.gif' })).toEqual([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-framerate', '25', '-c:v', 'png', '-i', '-',
      '-filter_complex', '[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5',
      '-loop', '0',
      '/o/demo.partial.gif',
    ])
  })
  it('every argv entry is a string, and the output path is passed as one entry (no shell, so spaces are safe)', () => {
    const a = ffmpegArgs({ format: 'mp4', fps: 12, out: '/o/my demo; rm -rf x.mp4' })
    expect(a.every((x) => typeof x === 'string')).toBe(true)
    expect(a[a.length - 1]).toBe('/o/my demo; rm -rf x.partial.mp4')
  })
  it('frames-json has no ffmpeg step', () => {
    expect(() => ffmpegArgs({ format: 'frames-json', fps: 30, out: '/o/x.json' })).toThrow(/frames-json/)
  })
})
