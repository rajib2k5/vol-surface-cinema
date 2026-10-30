import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFileAtomic } from './atomicWrite.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'vsc-atomic-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('writeFileAtomic', () => {
  it('writes a new file and leaves no temporary file beside it', async () => {
    const f = path.join(dir, 'a.json')
    await writeFileAtomic(f, 'one')
    expect(readFileSync(f, 'utf8')).toBe('one')
    expect(readdirSync(dir)).toEqual(['a.json'])
  })

  it('replaces an existing file whole', async () => {
    const f = path.join(dir, 'a.json')
    writeFileSync(f, 'old')
    await writeFileAtomic(f, 'new')
    expect(readFileSync(f, 'utf8')).toBe('new')
    expect(readdirSync(dir)).toEqual(['a.json'])
  })

  it('on a failed rename keeps the target as it was and removes its temporary file', async () => {
    // The target is a non-empty directory, so rename onto it fails after the temporary file was written.
    const target = path.join(dir, 'a.json')
    mkdirSync(target)
    writeFileSync(path.join(target, 'keep'), 'x')
    await expect(writeFileAtomic(target, 'new')).rejects.toThrow()
    expect(existsSync(path.join(target, 'keep'))).toBe(true)
    expect(readdirSync(dir)).toEqual(['a.json'])
  })

  it('does not touch a user file that has the old fixed temporary name', async () => {
    const f = path.join(dir, 'a.json')
    writeFileSync(path.join(dir, 'a.partial.json'), 'USER')
    await writeFileAtomic(f, 'new')
    expect(readFileSync(path.join(dir, 'a.partial.json'), 'utf8')).toBe('USER')
  })
})
