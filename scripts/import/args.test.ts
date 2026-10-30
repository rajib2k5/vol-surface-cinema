import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_INPUT_BYTES, parseImportArgs, type ImportFs } from './args.ts'

const fsOk: ImportFs = { stat: () => ({ isFile: true, isSymlink: false, size: 40_000 }) }
const ctx = { cwd: '/work', fs: fsOk }

describe('parseImportArgs', () => {
  it('takes --in and resolves it against the cwd', () => {
    const r = parseImportArgs(['--in', 'src/surface_frames.json'], ctx)
    expect(r).toEqual({ ok: true, value: { input: path.resolve('/work', 'src/surface_frames.json') } })
  })
  it('accepts --in=value', () => {
    expect(parseImportArgs(['--in=/data/surface_frames.json'], ctx)).toEqual({ ok: true, value: { input: '/data/surface_frames.json' } })
  })
  it('requires --in', () => {
    expect(parseImportArgs([], ctx)).toMatchObject({ ok: false, message: expect.stringContaining('--in') })
  })
  it('rejects unknown options, positional arguments and a missing value', () => {
    expect(parseImportArgs(['--in', 'a.json', '--out', 'b.json'], ctx)).toMatchObject({ ok: false })
    expect(parseImportArgs(['a.json'], ctx)).toMatchObject({ ok: false })
    expect(parseImportArgs(['--in'], ctx)).toMatchObject({ ok: false })
    expect(parseImportArgs(['--in', '--force'], ctx)).toMatchObject({ ok: false })
  })
  it('rejects a path that is not a .json file', () => {
    expect(parseImportArgs(['--in', '/data/frames.csv'], ctx)).toMatchObject({ ok: false, message: expect.stringContaining('.json') })
  })
  it('rejects a missing file, a directory, a symlink and an oversize file', () => {
    const fs = (s: ReturnType<ImportFs['stat']>): ImportFs => ({ stat: () => s })
    expect(parseImportArgs(['--in', 'a.json'], { cwd: '/w', fs: fs(null) })).toMatchObject({ ok: false, message: expect.stringContaining('does not exist') })
    expect(parseImportArgs(['--in', 'a.json'], { cwd: '/w', fs: fs({ isFile: false, isSymlink: false, size: 0 }) })).toMatchObject({ ok: false, message: expect.stringContaining('regular file') })
    expect(parseImportArgs(['--in', 'a.json'], { cwd: '/w', fs: fs({ isFile: true, isSymlink: true, size: 10 }) })).toMatchObject({ ok: false, message: expect.stringContaining('symbolic link') })
    expect(parseImportArgs(['--in', 'a.json'], { cwd: '/w', fs: fs({ isFile: true, isSymlink: false, size: MAX_INPUT_BYTES + 1 }) })).toMatchObject({ ok: false, message: expect.stringContaining('too large') })
  })
})
