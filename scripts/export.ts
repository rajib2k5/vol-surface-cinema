// Deterministic headless export: drives window.__cinema.renderFrame(n) in Playwright's chromium and
// pipes PNG screenshots of #stage into ffmpeg. Usage and exit codes: docs/design.md §10.
//   npm run export -- --format gif|mp4|frames-json --dataset <id> [--fps N] [--size WxH] --out <path> [--force] [--max-frames N] [--gpu]
// Exit codes: 2 usage, 3 missing ffmpeg/browser/build, 4 render failure, 5 encode failure.
// frames-json (for Blender) needs no browser, ffmpeg or build: it bakes the frames with the same pure modules.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { rm, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { parseIndex } from '../src/lib/contract.ts'
import { checkFrameCount, parseArgs, resolveFps } from './export/args.ts'
import { createEncoder, EncodeError } from './export/encoder.ts'
import { exportFramesJson } from './export/framesJson.ts'
import { ffmpegArgs } from './export/ffmpegArgs.ts'
import { partialPath } from './export/paths.ts'
import { checkBrowser, checkFfmpeg, ffmpegCommand } from './export/preflight.ts'
import { openSession, RenderError } from './export/session.ts'

const FRAME_TIMEOUT_MS = 10_000
const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')

const err = (m: string) => process.stderr.write(`${m}\n`)

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** playback.fps of the dataset, read from the built files (the page is not up yet when the CLI picks the fps). */
function playbackFpsOf(dataset: string | null): number | undefined {
  const idx = parseIndex(JSON.parse(readFileSync(path.join(dist, 'data', 'index.json'), 'utf8')))
  if (!idx.ok) return undefined
  const entry = dataset === null ? idx.value[0] : idx.value.find((e) => e.id === dataset)
  if (!entry) return undefined
  const doc = JSON.parse(readFileSync(path.join(dist, 'data', entry.file), 'utf8')) as { playback?: { fps?: number } }
  return doc.playback?.fps
}

async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RenderError(`${what} timed out after ${ms} ms`)), ms)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Read a file under public/data by a bare name taken from index.json (the index parser only lets plain names through). */
function readData(name: string): string | null {
  try {
    return readFileSync(path.join(root, 'public', 'data', name), 'utf8')
  } catch {
    return null
  }
}

async function framesJson(args: { dataset: string | null; fps: number | null; size: { width: number; height: number }; out: string; maxFrames: number }): Promise<number> {
  const r = exportFramesJson({
    dataset: args.dataset,
    fps: args.fps,
    size: args.size,
    maxFrames: args.maxFrames,
    readIndex: () => readData('index.json') ?? '',
    readDataset: readData,
  })
  if (!r.ok) {
    err(`export: ${r.message}`)
    return r.code
  }
  // Written beside the target and renamed, so a failed run never leaves a half file under the final name.
  const partial = partialPath(args.out)
  try {
    await writeFile(partial, r.text)
    await rename(partial, args.out)
  } catch (e) {
    await rm(partial, { force: true }).catch(() => undefined)
    err(`export: could not write ${args.out}: ${(e as Error).message}`)
    return 4
  }
  err(`export: wrote ${args.out} (${(Buffer.byteLength(r.text) / 1e6).toFixed(2)} MB)`)
  return 0
}

async function main(): Promise<number> {
  // 1. Validate.
  const parsed = parseArgs(process.argv.slice(2), { cwd: process.cwd(), exists: existsSync, dirExists: isDir })
  if (!parsed.ok) {
    err(`export: ${parsed.message}`)
    return 2
  }
  const args = parsed.value
  if (args.format === 'frames-json') return framesJson(args)

  // 2. Preflight, before any browser starts.
  const ff = ffmpegCommand(process.env)
  const f = checkFfmpeg(ff, (cmd, a) => spawnSync(cmd, a, { stdio: 'ignore', shell: false }))
  if (!f.ok) {
    err(`export: ${f.message}`)
    return 3
  }
  const b = checkBrowser(chromium.executablePath(), existsSync)
  if (!b.ok) {
    err(`export: ${b.message}`)
    return 3
  }
  if (!existsSync(path.join(dist, 'index.html'))) {
    err('export: dist/ is missing. Run `npm run build` first (`npm run export` does it for you).')
    return 3
  }

  // 3. Serve and launch.
  const fps = resolveFps(args.format, args.fps, playbackFpsOf(args.dataset))
  let session
  try {
    session = await openSession({ root, dataset: args.dataset, width: args.size.width, height: args.size.height, fps, gpu: args.gpu })
  } catch (e) {
    err(`export: ${(e as Error).message}`)
    return 4
  }
  const { page, ready } = session
  const total = ready.totalFrames
  const tooMany = checkFrameCount(total, args.maxFrames)
  if (tooMany) {
    err(`export: ${tooMany}`)
    await session.close()
    return 2
  }

  const encoder = createEncoder({
    ffmpeg: ff,
    args: ffmpegArgs({ format: args.format, fps, out: args.out }),
    partial: partialPath(args.out),
    final: args.out,
    spawn: spawn as never,
    fs: { rename, rm: (p) => rm(p, { force: true }) },
  })

  // 4. Capture loop.
  const stage = page.locator('#stage')
  const t0 = Date.now()
  try {
    err(`export: ${total} frames at ${fps} fps, ${args.size.width}x${args.size.height}, ${args.format} -> ${args.out}`)
    for (let n = 0; n < total; n++) {
      await withTimeout(page.evaluate((k) => (window.__cinema as NonNullable<typeof window.__cinema>).renderFrame(k), n), FRAME_TIMEOUT_MS, `renderFrame(${n})`)
      if (session.errors().length > 0) throw new RenderError(session.errors().join('\n'))
      const png = await withTimeout(stage.screenshot({ type: 'png' }), FRAME_TIMEOUT_MS, `screenshot of frame ${n}`)
      await encoder.write(png)
      if ((n + 1) % 10 === 0 || n + 1 === total) {
        const perFrame = (Date.now() - t0) / (n + 1) / 1000
        err(`  frame ${n + 1}/${total}  ${perFrame.toFixed(3)} s/frame  ETA ${Math.round(perFrame * (total - n - 1))} s`)
      }
    }
    // 5. Encode and finish.
    await encoder.finish()
    const secs = (Date.now() - t0) / 1000
    err(`export: wrote ${args.out} (${total} frames in ${secs.toFixed(1)} s, ${(secs / total).toFixed(3)} s/frame)`)
    return 0
  } catch (e) {
    await encoder.abort().catch(() => undefined)
    if (e instanceof EncodeError) {
      err(`export: encode failed: ${e.message}`)
      return 5
    }
    err(`export: render failed: ${(e as Error).message}`)
    return 4
  } finally {
    await session.close()
  }
}

process.exitCode = await main()
