import { describe, expect, it } from 'vitest'
import { checkBrowser, checkDatasetKnown, checkFfmpeg, ffmpegCommand } from './preflight.ts'

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

describe('checkDatasetKnown', () => {
  const index = JSON.stringify({ datasets: [{ id: 'one', title: 'One', file: 'one.json' }, { id: 'two', title: 'Two', file: 'two.json' }] })
  it('ok for a listed id, and for no id (the default is the first entry)', () => {
    expect(checkDatasetKnown('two', index)).toEqual({ ok: true })
    expect(checkDatasetKnown(null, index)).toEqual({ ok: true })
  })
  it('exit 2 for a well-formed id that is not listed, naming the id and the known ones', () => {
    const r = checkDatasetKnown('three', index)
    expect(r).toMatchObject({ ok: false, code: 2 })
    if (!r.ok) expect(r.message).toMatch(/"three".*one, two/s)
  })
  it('exit 4 when index.json is missing, not JSON or invalid', () => {
    expect(checkDatasetKnown('one', null)).toMatchObject({ ok: false, code: 4 })
    expect(checkDatasetKnown('one', '{nope')).toMatchObject({ ok: false, code: 4 })
    expect(checkDatasetKnown('one', '{"datasets": 3}')).toMatchObject({ ok: false, code: 4 })
  })
})
