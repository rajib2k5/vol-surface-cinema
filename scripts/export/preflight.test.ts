import { describe, expect, it } from 'vitest'
import { checkBrowser, checkFfmpeg, ffmpegCommand } from './preflight.ts'

describe('ffmpegCommand', () => {
  it('uses the FFMPEG env var when set, else ffmpeg from PATH', () => {
    expect(ffmpegCommand({ FFMPEG: '/opt/ff/bin/ffmpeg' })).toBe('/opt/ff/bin/ffmpeg')
    expect(ffmpegCommand({})).toBe('ffmpeg')
    expect(ffmpegCommand({ FFMPEG: '' })).toBe('ffmpeg')
  })
})

describe('checkFfmpeg', () => {
  it('ok when `ffmpeg -version` exits 0, run as an argv array', () => {
    const calls: [string, string[]][] = []
    const r = checkFfmpeg('ffmpeg', (cmd, args) => (calls.push([cmd, args]), { status: 0, error: undefined }))
    expect(r).toEqual({ ok: true })
    expect(calls).toEqual([['ffmpeg', ['-version']]])
  })
  it('missing binary (spawn error) gives exit-3 advice naming the FFMPEG variable', () => {
    const r = checkFfmpeg('ffmpeg', () => ({ status: null, error: Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }) }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/ffmpeg.*FFMPEG/s)
  })
  it('a non-zero exit is also a failure', () => {
    expect(checkFfmpeg('ffmpeg', () => ({ status: 1, error: undefined })).ok).toBe(false)
  })
})

describe('checkBrowser', () => {
  it('ok when the chromium executable exists', () => {
    expect(checkBrowser('/cache/chromium', () => true)).toEqual({ ok: true })
  })
  it('missing gives the install hint', () => {
    const r = checkBrowser('/cache/chromium', () => false)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('npx playwright install chromium')
  })
})
