// Regenerates every image in docs/images/ from real runs. Usage: `npm run screenshots` (builds first;
// needs ffmpeg, `npx playwright install chromium`, and network access for `npm ci`).
//   01 and 06: the real stdout and stderr of commands run in a throwaway clone at /tmp/demo-vol-surface-cinema,
//              ANSI codes stripped, absolute paths rewritten, then drawn as an HTML page and screenshotted.
//   02 to 05: screenshots of the live page, driven through its own controls.
// The script stops before it writes a terminal image if the captured text holds a home path, the host name or an email address.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import path from 'node:path'
import { preview } from 'vite'
import { chromium, type Page } from 'playwright'

const root = path.resolve(import.meta.dirname, '..')
const images = path.join(root, 'docs', 'images')
// /tmp/demo is shared with other tools that wipe it, so this script owns its own folder. Set SCREENSHOT_DEMO_DIR to use another one.
const demo = process.env.SCREENSHOT_DEMO_DIR ?? '/tmp/demo-vol-surface-cinema'
const MARKER = '.vsc-screenshots'
const SWIFTSHADER = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
const MAX_BYTES = 500_000

// ---------- terminal shots ----------

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g

/** Remove ANSI codes, and keep only the last part of a line that was redrawn with a carriage return. */
export function clean(text: string): string {
  return text
    .replace(ANSI, '')
    .split('\n')
    .map((line) => line.split('\r').filter((s) => s !== '').pop() ?? '')
    .join('\n')
    .replace(/\n+$/, '')
}

/** Rewrite absolute paths to repo-relative ones. */
export function relativize(text: string, bases: readonly string[]): string {
  let out = text
  for (const base of [...bases].sort((a, b) => b.length - a.length)) out = out.split(`${base}/`).join('').split(base).join('.')
  return out
}

/** Throws when the text could identify the machine or the person. */
export function assertPrivate(text: string, host: string): void {
  const checks: [string, RegExp][] = [
    ['a /home/ path', /\/home\//],
    ['a /Users/ path', /\/Users\//],
    ['the host name', new RegExp(host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')],
    ['an email address', /[\w.+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/],
    ['the user name', /rajib/i],
  ]
  for (const [what, re] of checks) if (re.test(text)) throw new Error(`privacy check failed: the captured text contains ${what}`)
}

function trim(text: string, keep: number): string {
  const lines = text.split('\n')
  return lines.length <= keep ? text : ['…', ...lines.slice(-keep)].join('\n')
}

interface Step {
  cmd: string
  /** Keep this many last lines of the output. */
  keep: number
}

/** The environment of a fresh terminal: no variables that `npm run` adds to this process (they change what `npm ci` installs). */
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (/^npm_/i.test(k) || k === 'INIT_CWD' || k === 'NODE_ENV' || k === 'CI') delete env[k]
  return env
}

function capture(step: Step): string {
  const r = spawnSync('bash', ['-c', `${step.cmd} 2>&1`], {
    cwd: demo,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...cleanEnv(), PS1: '$ ', NO_COLOR: '1', FORCE_COLOR: '0' },
  })
  if (r.status !== 0) throw new Error(`"${step.cmd}" exited ${r.status}\n${r.stdout}`)
  return trim(relativize(clean(r.stdout), [demo, root]), step.keep)
}

function termHtml(blocks: { cmd: string; out: string }[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const body = blocks.map((b) => `<span class="p">$ ${esc(b.cmd)}</span>\n${esc(b.out)}\n\n`).join('').trimEnd()
  return `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0d1117"><pre id="term" style="margin:0;padding:20px 24px;display:inline-block;min-width:860px;max-width:1180px;box-sizing:border-box;background:#0d1117;color:#c9d1d9;font:14px/1.45 'DejaVu Sans Mono',Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-all"><style>.p{color:#7ee787}</style>${body}</pre>`
}

async function terminalShot(name: string, steps: Step[], page: Page): Promise<void> {
  const blocks = steps.map((s) => ({ cmd: s.cmd, out: capture(s) }))
  const all = blocks.map((b) => `$ ${b.cmd}\n${b.out}`).join('\n')
  assertPrivate(all, hostname())
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.setContent(termHtml(blocks))
  await page.locator('#term').screenshot({ path: path.join(images, name), type: 'png' })
}

function prepareClone(): void {
  // Only a directory that an earlier run of this script made (it holds the marker file) is ever removed.
  if (existsSync(demo)) {
    if (!existsSync(path.join(demo, MARKER))) throw new Error(`${demo} exists and was not made by this script. Set SCREENSHOT_DEMO_DIR.`)
    rmSync(demo, { recursive: true, force: true })
  }
  const r = spawnSync('git', ['clone', '--quiet', root, demo], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git clone failed\n${r.stderr}`)
  writeFileSync(path.join(demo, MARKER), '')
}

// ---------- page shots ----------

async function openPlayer(page: Page, base: string, dataset: string): Promise<void> {
  await page.goto(`${base}?dataset=${dataset}`)
  await page.waitForSelector('.caption', { timeout: 15_000 })
  await page.waitForSelector('canvas')
  const toggle = page.locator('#controls .row button')
  if ((await toggle.textContent()) === 'Pause') await toggle.click()
  await page.waitForFunction(() => document.querySelector('#controls .row button')?.textContent === 'Play')
}

async function seek(page: Page, frame: number): Promise<void> {
  await page.locator('#controls input[type=range]').fill(String(frame))
  // Two animation frames so the surface is drawn before the shot.
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
}

async function shot(page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }): Promise<void> {
  await page.screenshot({ path: path.join(images, name), type: 'png', ...(clip ? { clip } : {}) })
}

async function main(): Promise<void> {
  mkdirSync(images, { recursive: true })
  if (!existsSync(path.join(root, 'dist', 'index.html'))) throw new Error('dist/ is missing. Run `npm run build` first.')
  const server = await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false } })
  const browser = await chromium.launch({ headless: true, args: SWIFTSHADER })
  try {
    const base = server.resolvedUrls?.local[0] as string
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

    // 02, 03, 04: the synthetic dataset.
    await openPlayer(page, base, 'synthetic-regime-story')
    await seek(page, 12) // a calm date, early in the story
    await shot(page, '02-player.png')

    const spike = page.locator('#controls .picker button.event', { hasText: 'Volatility spike' })
    await spike.click()
    await page.waitForFunction(() => [...document.querySelectorAll('.pill')].some((el) => (el as HTMLElement).style.display !== 'none' && /Volatility spike/.test(el.textContent ?? '')))
    await shot(page, '03-event.png')

    await seek(page, 150) // mid-scrub, between two event dates
    await page.locator('#controls input[type=range]').focus()
    // A tall viewport so the dataset menu, which sits below the 60 date buttons, is in view for the crop.
    await page.setViewportSize({ width: 1280, height: 1300 })
    const box = async (sel: string) => (await page.locator(sel).boundingBox())!
    const c = await box('#controls')
    const m = await box('#meta')
    const x = Math.max(0, Math.min(c.x, m.x) - 8)
    const y = Math.max(0, c.y - 8)
    const w = Math.min(1280 - x, Math.max(c.x + c.width, m.x + m.width) - x + 8)
    const dsMenu = await box('#dataset-menu')
    const h = Math.min(1300 - y, dsMenu.y + dsMenu.height - y + 8)
    await shot(page, '04-controls.png', { x, y, width: w, height: h })
    await page.setViewportSize({ width: 1280, height: 800 })

    // 05: the real dataset, in the middle of a transition between two dates.
    await openPlayer(page, base, 'optionsdx-spy-4dates')
    await seek(page, 60)
    const caption = (await page.locator('.caption').textContent()) ?? ''
    if (!caption.includes('(interpolated)')) throw new Error(`frame 60 is not interpolated; caption is "${caption}"`)
    await shot(page, '05-real-dataset.png')

    if (errors.length > 0) throw new Error(`page errors:\n${errors.join('\n')}`)

    // 01, 06: terminal output of real runs in a throwaway clone.
    prepareClone()
    const term = await context.newPage()
    await terminalShot('01-install.png', [
      { cmd: 'npm ci', keep: 15 },
      { cmd: 'npm run build', keep: 15 },
    ], term)
    await terminalShot('06-export.png', [
      { cmd: 'npm run export -- --format gif --dataset optionsdx-spy-4dates --fps 10 --size 640x360 --out spy.gif', keep: 22 },
    ], term)
  } finally {
    await browser.close()
    await server.close()
  }

  let bad = false
  for (const f of ['01-install', '02-player', '03-event', '04-controls', '05-real-dataset', '06-export']) {
    const size = statSync(path.join(images, `${f}.png`)).size
    console.log(`${f}.png ${(size / 1000).toFixed(0)} KB`)
    if (size > MAX_BYTES) bad = true
  }
  if (bad) throw new Error(`an image is larger than ${MAX_BYTES} bytes`)
}

// Run only when started directly, so the pure helpers can be imported by a test.
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) await main()
