/**
 * Streams PNG frames into one ffmpeg process and finishes or cleans up. Spawn and the filesystem are
 * injected so the failure paths (ffmpeg dies mid-stream, EPIPE, spawn error) are unit-tested.
 *
 *   write(png)  -> stdin, waits until flushed. Rejects with EncodeError if ffmpeg is gone.
 *   finish()    -> closes stdin, waits for exit 0, renames .partial to the final name.
 *   abort()     -> kills ffmpeg and deletes the .partial file. Safe to call twice.
 */
import type { EventEmitter } from 'node:events'
import type { Writable } from 'node:stream'

export class EncodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EncodeError'
  }
}

export interface ChildLike extends EventEmitter {
  stdin: Writable
  stderr: EventEmitter
  kill(signal?: NodeJS.Signals): boolean
}

export type SpawnLike = (cmd: string, args: string[], opts: { shell: false; stdio: ['pipe', 'ignore', 'pipe'] }) => ChildLike

export interface EncoderFs {
  rename(from: string, to: string): Promise<void>
  rm(path: string): Promise<void>
}

export interface Encoder {
  write(png: Buffer): Promise<void>
  finish(): Promise<void>
  abort(): Promise<void>
}

export interface EncoderOptions {
  ffmpeg: string
  args: string[]
  partial: string
  final: string
  spawn: SpawnLike
  fs: EncoderFs
}

const TAIL_LINES = 20

export function createEncoder(o: EncoderOptions): Encoder {
  const child = o.spawn(o.ffmpeg, o.args, { shell: false, stdio: ['pipe', 'ignore', 'pipe'] })
  let stderrText = ''
  let failure: EncodeError | null = null
  let exited = false
  let exitCode: number | null = null
  let signalFailure!: () => void
  const failed = new Promise<void>((resolve) => (signalFailure = resolve))
  let signalClosed!: () => void
  const closed = new Promise<void>((resolve) => (signalClosed = resolve))

  const tail = () => stderrText.split('\n').filter((l) => l !== '').slice(-TAIL_LINES).join('\n')
  const setFailure = (message: string) => {
    if (failure) return
    failure = new EncodeError(`${message}\n${tail()}`.trimEnd())
    signalFailure()
  }

  child.stderr.on('data', (chunk: Buffer) => {
    stderrText += chunk.toString()
    if (stderrText.length > 20_000) stderrText = stderrText.slice(-10_000)
  })
  child.stdin.on('error', (e: Error) => setFailure(`ffmpeg stdin error: ${e.message}`))
  child.on('error', (e: Error) => setFailure(`ffmpeg could not run: ${e.message}`))
  child.on('close', (code: number | null, signal: string | null) => {
    exited = true
    exitCode = code
    if (code !== 0 && !failure) setFailure(`ffmpeg exited with code ${code ?? `signal ${signal}`}`)
    signalClosed()
  })

  return {
    async write(png) {
      if (failure) throw failure
      const wrote = new Promise<void>((resolve, reject) => {
        child.stdin.write(png, (err) => (err ? reject(err) : resolve()))
      })
      try {
        await Promise.race([wrote, failed])
      } catch (e) {
        setFailure(`ffmpeg stdin write failed: ${(e as Error).message}`)
      }
      if (failure) throw failure
    },
    async finish() {
      if (failure) throw failure
      child.stdin.end()
      await Promise.race([closed, failed])
      if (failure) throw failure
      if (exitCode !== 0) throw new EncodeError(`ffmpeg exited with code ${exitCode}\n${tail()}`.trimEnd())
      await o.fs.rename(o.partial, o.final)
    },
    async abort() {
      if (!exited) {
        child.kill('SIGKILL')
        child.stdin.destroy()
        await Promise.race([closed, new Promise<void>((r) => setTimeout(r, 2000))])
      }
      await o.fs.rm(o.partial)
    },
  }
}
