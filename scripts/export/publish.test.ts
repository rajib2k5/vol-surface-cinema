import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { copyFile, link, rename, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OutputExistsError, publishFile, writeViaPartial, type PublishFs } from './publish.ts'

let dir: string
beforeEach(() => void (dir = mkdtempSync(path.join(tmpdir(), 'vsc-publish-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const realFs: PublishFs = { rename, link, unlink, copyFile }
const errno = (code: string) => Object.assign(new Error(code), { code })

describe('publishFile without force', () => {
  it('moves the temporary file to the output name when nothing is there', async () => {
    const tmp = path.join(dir, '.t.partial')
    const out = path.join(dir, 'o.gif')
    writeFileSync(tmp, 'new')
    await publishFile(tmp, out, false)
    expect(readFileSync(out, 'utf8')).toBe('new')
    expect(readdirSync(dir)).toEqual(['o.gif'])
  })

  it('fails with OutputExistsError when the output already exists, keeps its bytes, and removes only our temporary file', async () => {
    const tmp = path.join(dir, '.t.partial')
    const out = path.join(dir, 'o.gif')
    const other = path.join(dir, 'other.txt')
    writeFileSync(tmp, 'new')
    writeFileSync(out, 'USER BYTES')
    writeFileSync(other, 'x')
    await expect(publishFile(tmp, out, false)).rejects.toBeInstanceOf(OutputExistsError)
    expect(readFileSync(out, 'utf8')).toBe('USER BYTES')
    expect(readdirSync(dir).sort()).toEqual(['o.gif', 'other.txt'])
  })

  it.each(['EPERM', 'EXDEV', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS'])('falls back to an exclusive copy when link fails with %s', async (code) => {
    const tmp = path.join(dir, '.t.partial')
    const out = path.join(dir, 'o.gif')
    writeFileSync(tmp, 'new')
    const calls: string[] = []
    const fs: PublishFs = {
      ...realFs,
      link: async () => { throw errno(code) },
      copyFile: async (a, b, mode) => { calls.push(`copy ${mode}`); return copyFile(a, b, mode) },
    }
    await publishFile(tmp, out, false, fs)
    expect(readFileSync(out, 'utf8')).toBe('new')
    expect(calls).toEqual([`copy 1`]) // COPYFILE_EXCL
    expect(readdirSync(dir)).toEqual(['o.gif'])
  })

  it('the copy fallback also refuses to overwrite a file that appeared', async () => {
    const tmp = path.join(dir, '.t.partial')
    const out = path.join(dir, 'o.gif')
    writeFileSync(tmp, 'new')
    writeFileSync(out, 'USER BYTES')
    const fs: PublishFs = { ...realFs, link: async () => { throw errno('EPERM') } }
    await expect(publishFile(tmp, out, false, fs)).rejects.toBeInstanceOf(OutputExistsError)
    expect(readFileSync(out, 'utf8')).toBe('USER BYTES')
    expect(readdirSync(dir).sort()).toEqual(['o.gif'])
  })

  it('passes other link errors through and keeps the temporary file for the caller to remove', async () => {
    const tmp = path.join(dir, '.t.partial')
    writeFileSync(tmp, 'new')
    const fs: PublishFs = { ...realFs, link: async () => { throw errno('EACCES') } }
    await expect(publishFile(tmp, path.join(dir, 'o.gif'), false, fs)).rejects.toMatchObject({ code: 'EACCES' })
  })
})

describe('publishFile with force', () => {
  it('replaces an existing output', async () => {
    const tmp = path.join(dir, '.t.partial')
    const out = path.join(dir, 'o.gif')
    writeFileSync(tmp, 'new')
    writeFileSync(out, 'old')
    await publishFile(tmp, out, true)
    expect(readFileSync(out, 'utf8')).toBe('new')
    expect(readdirSync(dir)).toEqual(['o.gif'])
  })
})

describe('writeViaPartial (frames-json)', () => {
  it('writes the text and leaves no temporary file', async () => {
    const out = path.join(dir, 'f.json')
    await writeViaPartial(out, '{"a":1}', false)
    expect(readFileSync(out, 'utf8')).toBe('{"a":1}')
    expect(readdirSync(dir)).toEqual(['f.json'])
  })

  it('an output created during the run survives byte-identical and the run fails', async () => {
    const out = path.join(dir, 'f.json')
    const racing: PublishFs = {
      ...realFs,
      link: async (a, b) => {
        writeFileSync(out, 'USER BYTES') // the file appears after the run started, before it publishes
        return link(a, b)
      },
    }
    await expect(writeViaPartial(out, '{"a":1}', false, racing)).rejects.toBeInstanceOf(OutputExistsError)
    expect(readFileSync(out, 'utf8')).toBe('USER BYTES')
    expect(readdirSync(dir)).toEqual(['f.json'])
  })
})
