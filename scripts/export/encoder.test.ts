import { EventEmitter } from 'node:events'
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createEncoder, EncodeError, type EncoderFs, type SpawnLike } from './encoder.ts'

interface FakeChild extends EventEmitter {
  stdin: Writable
  stderr: EventEmitter
  kill: (sig?: string) => boolean
  killed: boolean
  written: Buffer[]
}

/** A fake ffmpeg: records what is written to stdin, and lets the test decide when and how it exits. */
function fake(opts: { backpressure?: boolean } = {}) {
  const child = new EventEmitter() as FakeChild
  child.written = []
  child.killed = false
  child.stderr = new EventEmitter()
  let release: (() => void) | null = null
  child.stdin = new Writable({
    highWaterMark: opts.backpressure ? 1 : 1 << 20,
    write(chunk, _enc, cb) {
      child.written.push(Buffer.from(chunk))
      if (opts.backpressure) release = cb
      else cb()
    },
  })
  child.kill = () => {
    child.killed = true
    queueMicrotask(() => child.emit('close', null, 'SIGKILL'))
    return true
  }
  const spawnCalls: { cmd: string; args: string[]; opts: unknown }[] = []
  const spawn: SpawnLike = (cmd, args, o) => {
    spawnCalls.push({ cmd, args: [...args], opts: o })
    return child as never
  }
  const fsLog: string[] = []
  const fs: EncoderFs = {
    rename: async (a, b) => void fsLog.push(`rename ${a} ${b}`),
    rm: async (p) => void fsLog.push(`rm ${p}`),
  }
  return { child, spawn, spawnCalls, fs, fsLog, flush: () => release?.() }
}

const mk = (f: ReturnType<typeof fake>, extra: { ffmpeg?: string } = {}) =>
  createEncoder({ ffmpeg: extra.ffmpeg ?? 'ffmpeg', args: ['-i', '-', '/o/a.partial.mp4'], partial: '/o/a.partial.mp4', final: '/o/a.mp4', spawn: f.spawn, fs: f.fs })

describe('createEncoder', () => {
  it('spawns ffmpeg with an argv array and shell: false', () => {
    const f = fake()
    mk(f, { ffmpeg: '/usr/bin/ffmpeg' })
    expect(f.spawnCalls[0].cmd).toBe('/usr/bin/ffmpeg')
    expect(f.spawnCalls[0].args).toEqual(['-i', '-', '/o/a.partial.mp4'])
    expect(f.spawnCalls[0].opts).toMatchObject({ shell: false })
  })

  it('writes every frame to stdin in order; finish() closes stdin, waits for exit 0, then renames .partial to the final name', async () => {
    const f = fake()
    const enc = mk(f)
    await enc.write(Buffer.from('AA'))
    await enc.write(Buffer.from('BB'))
    const done = enc.finish()
    await new Promise((r) => setImmediate(r))
    expect(f.fsLog).toEqual([]) // not renamed before ffmpeg exits
    f.child.emit('close', 0, null)
    await done
    expect(Buffer.concat(f.child.written).toString()).toBe('AABB')
    expect(f.fsLog).toEqual(['rename /o/a.partial.mp4 /o/a.mp4'])
  })

  it('waits for drain when stdin applies backpressure', async () => {
    const f = fake({ backpressure: true })
    const enc = mk(f)
    let resolved = false
    const w = enc.write(Buffer.from('0123456789')).then(() => (resolved = true))
    await new Promise((r) => setImmediate(r))
    expect(resolved).toBe(false)
    f.flush()
    await w
    expect(resolved).toBe(true)
  })

  it('ffmpeg dying mid-stream: write rejects with EncodeError carrying the last 20 stderr lines, .partial is deleted, nothing is renamed', async () => {
    const f = fake()
    const enc = mk(f)
    await enc.write(Buffer.from('frame0'))
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n') + '\n'
    f.child.stderr.emit('data', Buffer.from(lines))
    f.child.emit('close', 1, null)
    const err = await enc.write(Buffer.from('frame1')).catch((e) => e)
    expect(err).toBeInstanceOf(EncodeError)
    expect(err.message).toContain('exited with code 1')
    expect(err.message).toContain('line 29')
    expect(err.message).toContain('line 10')
    expect(err.message).not.toContain('line 9\n')
    expect(err.message).not.toContain('line 0\n')
    await enc.abort()
    expect(f.fsLog).toContain('rm /o/a.partial.mp4')
    expect(f.fsLog.some((l) => l.startsWith('rename'))).toBe(false)
  })

  it('an EPIPE on stdin (ffmpeg gone) is reported as an EncodeError, not an unhandled error event', async () => {
    const f = fake()
    const enc = mk(f)
    f.child.stderr.emit('data', Buffer.from('Error: boom\n'))
    f.child.stdin.destroy(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
    const err = await enc.write(Buffer.from('x')).catch((e) => e)
    expect(err).toBeInstanceOf(EncodeError)
    expect(err.message).toContain('Error: boom')
  })

  it('finish() fails with EncodeError when ffmpeg exits non-zero, and does not rename', async () => {
    const f = fake()
    const enc = mk(f)
    const done = enc.finish().catch((e) => e)
    f.child.stderr.emit('data', Buffer.from('bad filter\n'))
    f.child.emit('close', 3, null)
    const err = await done
    expect(err).toBeInstanceOf(EncodeError)
    expect(err.message).toContain('bad filter')
    expect(f.fsLog.some((l) => l.startsWith('rename'))).toBe(false)
  })

  it('abort() kills the process and deletes the .partial file; calling it twice is harmless', async () => {
    const f = fake()
    const enc = mk(f)
    await enc.abort()
    await enc.abort()
    expect(f.child.killed).toBe(true)
    expect(f.fsLog.filter((l) => l === 'rm /o/a.partial.mp4').length).toBeGreaterThanOrEqual(1)
  })

  it('a spawn error (ffmpeg not found) rejects the next write with an EncodeError', async () => {
    const f = fake()
    const enc = mk(f)
    f.child.emit('error', Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }))
    const err = await enc.write(Buffer.from('x')).catch((e) => e)
    expect(err).toBeInstanceOf(EncodeError)
    expect(err.message).toContain('ENOENT')
  })
})
