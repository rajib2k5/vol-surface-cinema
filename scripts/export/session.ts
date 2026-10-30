/**
 * A headless session on the built page: Vite's preview server on 127.0.0.1 (port 0) plus Playwright's
 * chromium (SwiftShader unless gpu). Shared by the export CLI and the e2e smoke test.
 * Any pageerror or console error is collected; callers check errors() between frames.
 */
import { preview } from 'vite'
import { chromium, type Browser, type Page } from 'playwright'

export interface SessionOptions {
  root: string
  dataset: string | null
  width: number
  height: number
  fps: number | null
  gpu: boolean
}

export interface CinemaReady {
  totalFrames: number
  fps: number
  width: number
  height: number
}

export interface Session {
  page: Page
  ready: CinemaReady
  /** Messages from pageerror and console errors seen so far. */
  errors(): string[]
  close(): Promise<void>
}

export class RenderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RenderError'
  }
}

export function queryFor(o: Pick<SessionOptions, 'dataset' | 'width' | 'height' | 'fps'>): string {
  const p = new URLSearchParams({ export: '1', w: String(o.width), h: String(o.height) })
  if (o.dataset) p.set('dataset', o.dataset)
  if (o.fps !== null) p.set('fps', String(o.fps))
  return `?${p.toString()}`
}

export async function openSession(o: SessionOptions): Promise<Session> {
  const server = await preview({ root: o.root, preview: { host: '127.0.0.1', port: 0, open: false } })
  const url = server.resolvedUrls?.local[0]
  if (!url) {
    await server.close()
    throw new RenderError('the preview server did not report a URL')
  }
  let browser: Browser | null = null
  const close = async () => {
    await browser?.close().catch(() => undefined)
    await server.close().catch(() => undefined)
  }
  try {
    const args = o.gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    browser = await chromium.launch({ headless: true, args })
    const context = await browser.newContext({ viewport: { width: o.width, height: o.height }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console error: ${m.text()}`)
    })
    await page.goto(`${url}${queryFor(o)}`)
    await page.waitForFunction(() => window.__cinema !== undefined, undefined, { timeout: 15_000 })
    let ready: CinemaReady
    try {
      ready = await page.evaluate(() => (window.__cinema as NonNullable<typeof window.__cinema>).ready)
    } catch (e) {
      throw new RenderError(`the page failed to start: ${(e as Error).message}${errors.length ? `\n${errors.join('\n')}` : ''}`)
    }
    return { page, ready, errors: () => errors, close }
  } catch (e) {
    await close()
    throw e
  }
}
