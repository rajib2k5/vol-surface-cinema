// End-to-end smoke test of the export pipeline. Not part of `npm test`: run `npm run test:e2e`
// (builds first; needs ffmpeg and `npx playwright install chromium`).
// Synthetic story at 320x180, 10 fps. Passes when:
//   - ffprobe frame count == totalFrames, duration == total / fps within one frame
//   - frame 0 has > 5% non-background pixels
//   - frame k gives the same PNG sha256 on two renders (same page, and a fresh browser)
//   - frames-json (M5) agrees with the page on the caption and the visible event pills of several frames, and has totalFrames frames
//   - the CLI exits 4 for an unknown dataset and leaves no output, 3 without ffmpeg, 2 for bad arguments
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openSession } from '../../scripts/export/session.ts'

const root = path.resolve(import.meta.dirname, '../..')
const W = 320
const H = 180
const FPS = 10
const dir = mkdtempSync(path.join(tmpdir(), 'vsc-e2e-'))
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const cli = (args: string[], env: Record<string, string> = {}) =>
  spawnSync('node', ['scripts/export.ts', ...args], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' })

try {
  // 1. Real export.
  const out = path.join(dir, 'smoke.mp4')
  // A user file named like the old fixed partial path must survive the export untouched.
  const lookalike = path.join(dir, 'smoke.partial.mp4')
  writeFileSync(lookalike, 'USER DATA')
  const run = cli(['--format', 'mp4', '--dataset', 'synthetic-regime-story', '--fps', String(FPS), '--size', `${W}x${H}`, '--out', out])
  assert.equal(run.status, 0, `export exited ${run.status}\n${run.stderr}`)
  assert.ok(existsSync(out), 'output file exists')
  assert.deepEqual(readdirSync(dir).sort(), ['smoke.mp4', 'smoke.partial.mp4'], 'no temporary file left behind')
  assert.equal(readFileSync(lookalike, 'utf8'), 'USER DATA', 'a user file named like the old partial path is untouched')
  rmSync(lookalike)

  const session = await openSession({ root, dataset: 'synthetic-regime-story', width: W, height: H, fps: FPS, gpu: false })
  try {
    const total = session.ready.totalFrames
    const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,duration', '-of', 'json', out], { encoding: 'utf8' })
    const stream = JSON.parse(probe.stdout).streams[0]
    assert.equal(Number(stream.nb_read_frames), total, `ffprobe frames ${stream.nb_read_frames} vs totalFrames ${total}`)
    assert.ok(Math.abs(Number(stream.duration) - total / FPS) <= 1 / FPS, `duration ${stream.duration} vs ${total / FPS}`)

    // 2. Frame 0 is not blank.
    const stage = session.page.locator('#stage')
    await session.page.evaluate(() => window.__cinema!.renderFrame(0))
    const png0 = await stage.screenshot({ type: 'png' })
    const share = await session.page.evaluate(async (b64) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      const bg = [d[0], d[1], d[2]]
      let different = 0
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 24) different++
      return different / (c.width * c.height)
    }, png0.toString('base64'))
    assert.ok(share > 0.05, `frame 0 has only ${(share * 100).toFixed(1)}% non-background pixels`)

    // 3. Determinism: frame k twice in one page (with another frame in between), then in a fresh browser.
    const k = 25
    await session.page.evaluate((n) => window.__cinema!.renderFrame(n), k)
    const a = sha(await stage.screenshot({ type: 'png' }))
    await session.page.evaluate(() => window.__cinema!.renderFrame(100))
    await session.page.evaluate((n) => window.__cinema!.renderFrame(n), k)
    const b = sha(await stage.screenshot({ type: 'png' }))
    assert.equal(b, a, 'frame k differs between two renders in one page')
    const second = await openSession({ root, dataset: 'synthetic-regime-story', width: W, height: H, fps: FPS, gpu: false })
    try {
      await second.page.evaluate((n) => window.__cinema!.renderFrame(n), k)
      const c = sha(await second.page.locator('#stage').screenshot({ type: 'png' }))
      assert.equal(c, a, 'frame k differs between two browsers')
    } finally {
      await second.close()
    }
    // 3b. frames-json is baked from the same pure modules: it must agree with what the page shows.
    const fj = path.join(dir, 'frames.json')
    const fjRun = cli(['--format', 'frames-json', '--dataset', 'synthetic-regime-story', '--fps', String(FPS), '--size', `${W}x${H}`, '--out', fj])
    assert.equal(fjRun.status, 0, `frames-json exited ${fjRun.status}\n${fjRun.stderr}`)
    const baked = JSON.parse(readFileSync(fj, 'utf8')) as { frames: { n: number; caption: string; events: { label: string }[] }[] }
    assert.equal(baked.frames.length, total, 'frames-json frame count equals totalFrames')
    let pillFrames = 0
    for (const f of [0, 25, 40, 60, 100, total - 1]) {
      await session.page.evaluate((n) => window.__cinema!.renderFrame(n), f)
      const shown = await session.page.evaluate(() => ({
        caption: document.querySelector('.caption')!.textContent,
        pills: [...document.querySelectorAll('.pill')].filter((el) => (el as HTMLElement).style.display !== 'none').map((el) => el.textContent),
      }))
      assert.equal(shown.caption, baked.frames[f].caption, `caption of frame ${f}`)
      assert.deepEqual(shown.pills, baked.frames[f].events.map((e) => e.label), `event pills of frame ${f}`)
      if (shown.pills.length > 0) pillFrames++
    }
    assert.ok(pillFrames > 0, 'at least one of the compared frames shows an event pill, so the pill check is not vacuous')
    assert.deepEqual(session.errors(), [], 'no page errors')
    console.log(`ok: ${total} frames, ffprobe agrees, frame 0 ${(share * 100).toFixed(1)}% drawn, frame ${k} sha ${a.slice(0, 12)} stable`)
  } finally {
    await session.close()
  }

  // 4. Failure exits.
  const bad = path.join(dir, 'bad.mp4')
  const unknown = cli(['--format', 'mp4', '--dataset', 'no-such-dataset', '--size', `${W}x${H}`, '--out', bad])
  assert.equal(unknown.status, 4, `unknown dataset should exit 4, got ${unknown.status}\n${unknown.stderr}`)
  assert.ok(!existsSync(bad) && !readdirSync(dir).some((f) => f.includes('.partial.')), 'a failed export leaves no file')
  assert.equal(cli(['--format', 'mp4', '--out', bad, '--size', '321x180']).status, 2, 'odd size exits 2')
  assert.equal(cli(['--format', 'mp4', '--size', `${W}x${H}`, '--out', bad], { FFMPEG: '/nonexistent/ffmpeg' }).status, 3, 'missing ffmpeg exits 3')
  assert.equal(cli(['--format', 'mp4', '--size', `${W}x${H}`, '--out', out]).status, 2, 'existing output without --force exits 2')
  const fjBad = path.join(dir, 'bad.json')
  assert.equal(cli(['--format', 'frames-json', '--dataset', 'no-such-dataset', '--out', fjBad]).status, 2, 'frames-json with an unknown dataset exits 2')
  assert.ok(!existsSync(fjBad), 'a failed frames-json export leaves no file')
  console.log('ok: exit codes 2, 3 and 4 behave, no partial files left')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
