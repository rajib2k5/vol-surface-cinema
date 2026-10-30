import { describe, expect, it } from 'vitest'
import { checkFrameCount, parseArgs, resolveFps, type ArgsContext } from './args.ts'

const ctx = (over: Partial<ArgsContext> = {}): ArgsContext => ({
  cwd: '/work/repo',
  exists: () => false,
  dirExists: () => true,
  ...over,
})
const ok = (argv: string[], c = ctx()) => {
  const r = parseArgs(argv, c)
  if (!r.ok) throw new Error(`expected ok, got: ${r.message}`)
  return r.value
}
const fail = (argv: string[], c = ctx()) => {
  const r = parseArgs(argv, c)
  if (r.ok) throw new Error('expected failure but parsed ok')
  return r.message
}

describe('parseArgs: accepts', () => {
  it('a minimal mp4 export with defaults 1280x720, max-frames 10000, no force, no gpu', () => {
    expect(ok(['--format', 'mp4', '--out', 'out/demo.mp4'])).toEqual({
      format: 'mp4',
      dataset: null,
      fps: null,
      size: { width: 1280, height: 720 },
      out: '/work/repo/out/demo.mp4',
      force: false,
      maxFrames: 10_000,
      gpu: false,
    })
  })
  it('a gif defaults to 800x450', () => {
    expect(ok(['--format', 'gif', '--out', 'a.gif']).size).toEqual({ width: 800, height: 450 })
  })
  it('--flag=value spelling and every option', () => {
    const v = ok(['--format=mp4', '--dataset=synthetic-regime-story', '--fps=24', '--size=640x360', '--out=/tmp/x.mp4', '--force', '--max-frames=500', '--gpu'])
    expect(v).toMatchObject({ dataset: 'synthetic-regime-story', fps: 24, size: { width: 640, height: 360 }, out: '/tmp/x.mp4', force: true, maxFrames: 500, gpu: true })
  })
  it('an existing output with --force', () => {
    expect(ok(['--format', 'mp4', '--out', 'a.mp4', '--force'], ctx({ exists: () => true })).force).toBe(true)
  })
})

describe('parseArgs: exit-2 violations', () => {
  it('missing or unknown format', () => {
    expect(fail(['--out', 'a.mp4'])).toMatch(/--format/)
    expect(fail(['--format', 'webm', '--out', 'a.webm'])).toMatch(/--format/)
  })
  it('missing --out', () => {
    expect(fail(['--format', 'mp4'])).toMatch(/--out/)
  })
  it('an unknown flag or a positional argument', () => {
    expect(fail(['--format', 'mp4', '--out', 'a.mp4', '--bogus'])).toMatch(/unknown option/)
    expect(fail(['--format', 'mp4', '--out', 'a.mp4', 'extra'])).toMatch(/unexpected argument/)
  })
  it('a flag missing its value', () => {
    expect(fail(['--format', 'mp4', '--out'])).toMatch(/--out needs a value/)
  })
  it.each(['0', '61', '1.5', 'abc', '-3'])('mp4 fps %s', (f) => {
    expect(fail(['--format', 'mp4', '--out', 'a.mp4', '--fps', f])).toMatch(/--fps/)
  })
  it.each(['10', '20', '25', '50'])('gif accepts fps %s (a divisor of 100)', (f) => {
    expect(ok(['--format', 'gif', '--out', 'a.gif', '--fps', f]).fps).toBe(Number(f))
  })
  it.each(['30', '24', '12', '60', '15'])('gif rejects fps %s (GIF delays are centiseconds)', (f) => {
    expect(fail(['--format', 'gif', '--out', 'a.gif', '--fps', f])).toMatch(/--fps/)
  })
  it.each(['15x100', '100x15', '4098x100', '101x100', '100x101', '640', '640x', 'x360', '640X360', '0x0', '-640x360'])('size %s', (s) => {
    expect(fail(['--format', 'mp4', '--out', 'a.mp4', '--size', s])).toMatch(/--size/)
  })
  it('accepts the size limits 16x16 and 4096x4096', () => {
    expect(ok(['--format', 'mp4', '--out', 'a.mp4', '--size', '16x16']).size).toEqual({ width: 16, height: 16 })
    expect(ok(['--format', 'mp4', '--out', 'a.mp4', '--size', '4096x4096']).size).toEqual({ width: 4096, height: 4096 })
  })
  it('an extension that does not match the format', () => {
    expect(fail(['--format', 'mp4', '--out', 'a.gif'])).toMatch(/\.mp4/)
    expect(fail(['--format', 'gif', '--out', 'a.mp4'])).toMatch(/\.gif/)
    expect(fail(['--format', 'mp4', '--out', 'a'])).toMatch(/\.mp4/)
  })
  it('an output whose parent directory does not exist', () => {
    expect(fail(['--format', 'mp4', '--out', 'nope/a.mp4'], ctx({ dirExists: () => false }))).toMatch(/directory/)
  })
  it('an output that already exists, unless --force', () => {
    expect(fail(['--format', 'mp4', '--out', 'a.mp4'], ctx({ exists: () => true }))).toMatch(/already exists/)
  })
  it('a bad --max-frames and a bad dataset id', () => {
    expect(fail(['--format', 'mp4', '--out', 'a.mp4', '--max-frames', '0'])).toMatch(/--max-frames/)
    expect(fail(['--format', 'mp4', '--out', 'a.mp4', '--max-frames', 'x'])).toMatch(/--max-frames/)
    expect(fail(['--format', 'mp4', '--out', 'a.mp4', '--dataset', '../etc/passwd'])).toMatch(/--dataset/)
    expect(fail(['--format', 'mp4', '--out', 'a.mp4', '--dataset', 'A B'])).toMatch(/--dataset/)
  })
})

describe('parseArgs: --out can never be mistaken for an option', () => {
  it('a relative --out that starts with a dash is resolved under cwd, so the absolute path starts with /', () => {
    const v = ok(['--format', 'mp4', '--out=-rf.mp4'])
    expect(v.out).toBe('/work/repo/-rf.mp4')
    expect(v.out.startsWith('-')).toBe(false)
  })
  it('.. segments are resolved away', () => {
    expect(ok(['--format', 'mp4', '--out', 'sub/../a.mp4']).out).toBe('/work/repo/a.mp4')
  })
})

describe('resolveFps (CLI --fps > playback.fps > 30; gif default 25)', () => {
  it('mp4: the CLI value, else playback.fps, else 30', () => {
    expect(resolveFps('mp4', 24, 30)).toBe(24)
    expect(resolveFps('mp4', null, 20)).toBe(20)
    expect(resolveFps('mp4', null, undefined)).toBe(30)
  })
  it('gif: the CLI value, else 25 regardless of playback.fps', () => {
    expect(resolveFps('gif', 10, 30)).toBe(10)
    expect(resolveFps('gif', null, 30)).toBe(25)
  })
})

describe('checkFrameCount', () => {
  it('passes at the limit and fails one above, naming both numbers', () => {
    expect(checkFrameCount(10_000, 10_000)).toBeNull()
    expect(checkFrameCount(10_001, 10_000)).toMatch(/10001.*10000/)
  })
})
