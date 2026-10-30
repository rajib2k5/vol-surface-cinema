import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEncoder } from './encoder.ts'
import { ffmpegArgs } from './ffmpegArgs.ts'
import { createExclusive, reservePartial } from './partial.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'vsc-partial-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('reservePartial', () => {
  it('names a hidden file beside the output, with the real extension, that is not the old <stem>.partial.<ext> name', async () => {
    const out = path.join(dir, 'p.mp4')
    const partial = await reservePartial(out, { token: () => '42-abcd', create: async () => undefined })
    expect(partial).toBe(path.join(dir, '.p.42-abcd.partial.mp4'))
    expect(partial).not.toBe(path.join(dir, 'p.partial.mp4'))
  })

  it('tries another token when the name is taken (EEXIST), and gives up after a few tries', async () => {
    const tokens = ['a', 'b', 'c']
    const taken = new Set([path.join(dir, '.p.a.partial.mp4')])
    const created: string[] = []
    const create = async (p: string) => {
      if (taken.has(p)) throw Object.assign(new Error('exists'), { code: 'EEXIST' })
      created.push(p)
    }
    const out = path.join(dir, 'p.mp4')
    expect(await reservePartial(out, { token: () => tokens.shift() as string, create })).toBe(path.join(dir, '.p.b.partial.mp4'))
    expect(created).toEqual([path.join(dir, '.p.b.partial.mp4')])
    await expect(reservePartial(out, { token: () => 'a', create, tries: 3 })).rejects.toThrow(/unique/)
  })

  it('does not swallow other errors (a missing directory is not "taken")', async () => {
    const create = async () => {
      throw Object.assign(new Error('no dir'), { code: 'ENOENT' })
    }
    await expect(reservePartial(path.join(dir, 'p.mp4'), { token: () => 'x', create })).rejects.toThrow(/no dir/)
  })

  it('createExclusive refuses to touch a file that exists and leaves its bytes alone', async () => {
    const f = path.join(dir, 'x.txt')
    writeFileSync(f, 'mine')
    await expect(createExclusive(f)).rejects.toMatchObject({ code: 'EEXIST' })
    expect(readFileSync(f, 'utf8')).toBe('mine')
  })
})

/** A stand-in for ffmpeg: writes "encoded" to the last argv entry (the partial path) and then waits on stdin. */
const FAKE = "require('fs').writeFileSync(process.argv.at(-1), 'encoded'); process.stdin.on('data', () => {}); process.stdin.on('end', () => process.exit(0))"
const fakeSpawn = ((_cmd: string, args: string[]) => spawn(process.execPath, ['-e', FAKE, '--', ...args], { stdio: ['pipe', 'ignore', 'pipe'] })) as never

async function startEncoder(out: string) {
  const partial = await reservePartial(out)
  const encoder = createEncoder({
    ffmpeg: 'ffmpeg',
    args: ffmpegArgs({ format: 'mp4', fps: 10, partial }),
    partial,
    final: out,
    spawn: fakeSpawn,
    fs: { rename, rm: (p) => rm(p, { force: true }) },
  })
  return { encoder, partial }
}

describe('an export next to a user file named like the old partial path', () => {
  it('leaves that file untouched after a successful export, and leaves no temporary file', async () => {
    const out = path.join(dir, 'p.mp4')
    const lookalike = path.join(dir, 'p.partial.mp4')
    writeFileSync(lookalike, 'USER DATA')
    const { encoder } = await startEncoder(out)
    await encoder.write(Buffer.from('png'))
    await encoder.finish()
    expect(readFileSync(lookalike, 'utf8')).toBe('USER DATA')
    expect(readFileSync(out, 'utf8')).toBe('encoded')
    expect(readdirSync(dir).sort()).toEqual(['p.mp4', 'p.partial.mp4'])
  })

  it('leaves that file untouched after an aborted export, and removes only its own temporary file', async () => {
    const out = path.join(dir, 'p.mp4')
    const lookalike = path.join(dir, 'p.partial.mp4')
    writeFileSync(lookalike, 'USER DATA')
    const { encoder, partial } = await startEncoder(out)
    await encoder.write(Buffer.from('png'))
    await encoder.abort()
    expect(existsSync(partial)).toBe(false)
    expect(readFileSync(lookalike, 'utf8')).toBe('USER DATA')
    expect(existsSync(out)).toBe(false)
    expect(readdirSync(dir)).toEqual(['p.partial.mp4'])
  })
})
