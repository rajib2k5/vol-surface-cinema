/**
 * The `surface-sequence` v1 data contract and its validator. parseSequence returns every problem it
 * can find (up to 50) with a path like "frames[3].iv[2][5]", so a bad file is reported in one go.
 *
 * Pure: no I/O, no DOM.
 */

export type Easing = 'linear' | 'smoothstep' | 'easeInOutCubic'
export type EventKind = 'shock' | 'policy' | 'recovery' | 'note'

export interface Frame {
  date: string
  /** [dte][k] */
  iv: number[][]
  label?: string
  cell_flags?: number[][]
  quoted_share?: number
}

export interface SequenceEvent {
  date: string
  label: string
  kind?: EventKind
  hold_s?: number
  show_before_s?: number
  show_after_s?: number
}

export interface Sequence {
  schema: 'vol-surface-cinema/surface-sequence'
  schema_version: 1
  id: string
  title: string
  badge: string
  synthetic: boolean
  grid: { k: number[]; dte: number[] }
  frames: Frame[]
  events: SequenceEvent[]
  playback?: { fps?: number; hold_s?: number; transition_s?: number; easing?: Easing; loop?: boolean }
  display?: { iv_range?: [number, number]; orbit_turns?: number }
  source: {
    kind: 'synthetic' | 'derived'
    notice: string
    source_commit?: string
    generator?: { script: string; seed: number }
    providers?: { name: string; role: string; terms_url: string; licence: string }[]
  }
  licence: string
}

export interface ContractError {
  path: string
  message: string
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: ContractError[] }

export const SCHEMA = 'vol-surface-cinema/surface-sequence'
export const MAX_ERRORS = 50
export const MAX_FRAMES = 10_000
const ID_RE = /^[a-z0-9-]{1,64}$/
const EASINGS = ['linear', 'smoothstep', 'easeInOutCubic']
const EVENT_KINDS = ['shock', 'policy', 'recovery', 'note']
const SOURCE_KINDS = ['synthetic', 'derived']

class Collector {
  errors: ContractError[] = []
  add(path: string, message: string): void {
    if (this.errors.length < MAX_ERRORS) this.errors.push({ path, message })
  }
  get full(): boolean {
    return this.errors.length >= MAX_ERRORS
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

/** A real calendar date in YYYY-MM-DD form. */
export function isCalendarDate(s: unknown): s is string {
  if (!isStr(s) || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function checkAxis(c: Collector, path: string, v: unknown, integersAtLeast1: boolean): number {
  if (!Array.isArray(v) || v.length < 2) {
    c.add(path, 'must be an array of at least 2 numbers')
    return 0
  }
  let ok = true
  v.forEach((x, i) => {
    if (!isNum(x)) {
      c.add(`${path}[${i}]`, 'must be a finite number')
      ok = false
    } else if (integersAtLeast1 && (!Number.isInteger(x) || x < 1)) {
      c.add(`${path}[${i}]`, 'must be an integer >= 1')
      ok = false
    }
  })
  if (ok) for (let i = 1; i < v.length; i++) if (!(v[i] > v[i - 1])) {
    c.add(path, `must be strictly increasing (index ${i - 1} to ${i})`)
    break
  }
  return v.length
}

function checkIvGrid(c: Collector, path: string, v: unknown, nT: number, nK: number): void {
  if (!Array.isArray(v) || v.length !== nT) {
    c.add(path, `must have ${nT} rows (one per dte)`)
    return
  }
  v.forEach((row, i) => {
    if (!Array.isArray(row) || row.length !== nK) {
      c.add(`${path}[${i}]`, `must have ${nK} values (one per k)`)
      return
    }
    row.forEach((x, j) => {
      if (!isNum(x) || !(x > 0) || !(x < 5)) c.add(`${path}[${i}][${j}]`, `iv must be a finite number with 0 < iv < 5, got ${String(x)}`)
    })
  })
}

function checkFlags(c: Collector, path: string, v: unknown, nT: number, nK: number): void {
  const bad = !Array.isArray(v) || v.length !== nT || v.some((r) => !Array.isArray(r) || r.length !== nK || r.some((x) => !isNum(x)))
  if (bad) c.add(path, `must be a ${nT} x ${nK} grid of numbers`)
}

function optNonNeg(c: Collector, path: string, v: unknown): void {
  if (v !== undefined && !(isNum(v) && v >= 0)) c.add(path, 'must be a number >= 0')
}

export function parseSequence(raw: unknown): ParseResult<Sequence> {
  const c = new Collector()
  if (!isObj(raw)) {
    c.add('', 'must be a JSON object')
    return { ok: false, errors: c.errors }
  }
  if (raw.schema !== SCHEMA) c.add('schema', `must be "${SCHEMA}"`)
  if (raw.schema_version !== 1) c.add('schema_version', `unsupported version ${String(raw.schema_version)}: upgrade vol-surface-cinema`)
  if (!isStr(raw.id) || !ID_RE.test(raw.id)) c.add('id', 'must match /^[a-z0-9-]{1,64}$/')
  if (!isStr(raw.title) || raw.title === '') c.add('title', 'must be a non-empty string')
  if (!isStr(raw.badge) || raw.badge === '') c.add('badge', 'must be a non-empty string')
  if (typeof raw.synthetic !== 'boolean') c.add('synthetic', 'must be a boolean')
  if (!isStr(raw.licence) || raw.licence === '') c.add('licence', 'must be a non-empty string')

  // Grid
  let nK = 0
  let nT = 0
  if (!isObj(raw.grid)) c.add('grid', 'must be an object with k and dte')
  else {
    nK = checkAxis(c, 'grid.k', raw.grid.k, false)
    nT = checkAxis(c, 'grid.dte', raw.grid.dte, true)
  }

  // Frames
  const frameDates = new Set<string>()
  if (!Array.isArray(raw.frames) || raw.frames.length < 1 || raw.frames.length > MAX_FRAMES) {
    c.add('frames', `must be an array of 1 to ${MAX_FRAMES} frames`)
  } else {
    let prev = ''
    raw.frames.forEach((f, t) => {
      const p = `frames[${t}]`
      if (!isObj(f)) return c.add(p, 'must be an object')
      if (!isCalendarDate(f.date)) c.add(`${p}.date`, 'must be a valid YYYY-MM-DD date')
      else {
        if (t > 0 && !(f.date > prev)) c.add(`${p}.date`, `dates must be strictly increasing (${f.date} is not after ${prev})`)
        prev = f.date
        frameDates.add(f.date)
      }
      if (nK >= 2 && nT >= 2) {
        checkIvGrid(c, `${p}.iv`, f.iv, nT, nK)
        if (f.cell_flags !== undefined) checkFlags(c, `${p}.cell_flags`, f.cell_flags, nT, nK)
      }
      if (f.quoted_share !== undefined && !(isNum(f.quoted_share) && f.quoted_share >= 0 && f.quoted_share <= 1))
        c.add(`${p}.quoted_share`, 'must be a number in [0, 1]')
      if (f.label !== undefined && !isStr(f.label)) c.add(`${p}.label`, 'must be a string')
    })
  }

  // Events
  if (!Array.isArray(raw.events)) c.add('events', 'must be an array (may be empty)')
  else
    raw.events.forEach((e, i) => {
      const p = `events[${i}]`
      if (!isObj(e)) return c.add(p, 'must be an object')
      if (!isStr(e.date) || !frameDates.has(e.date)) c.add(`${p}.date`, 'must equal the date of some frame')
      if (!isStr(e.label) || e.label === '') c.add(`${p}.label`, 'must be a non-empty string')
      if (e.kind !== undefined && !EVENT_KINDS.includes(e.kind as string)) c.add(`${p}.kind`, `must be one of ${EVENT_KINDS.join(', ')}`)
      optNonNeg(c, `${p}.hold_s`, e.hold_s)
      optNonNeg(c, `${p}.show_before_s`, e.show_before_s)
      optNonNeg(c, `${p}.show_after_s`, e.show_after_s)
    })

  // Playback
  if (raw.playback !== undefined) {
    const pb = raw.playback
    if (!isObj(pb)) c.add('playback', 'must be an object')
    else {
      if (pb.fps !== undefined && !(isNum(pb.fps) && Number.isInteger(pb.fps) && pb.fps >= 1 && pb.fps <= 60)) c.add('playback.fps', 'must be an integer in 1..60')
      optNonNeg(c, 'playback.hold_s', pb.hold_s)
      optNonNeg(c, 'playback.transition_s', pb.transition_s)
      if (pb.easing !== undefined && !EASINGS.includes(pb.easing as string)) c.add('playback.easing', `must be one of ${EASINGS.join(', ')}`)
      if (pb.loop !== undefined && typeof pb.loop !== 'boolean') c.add('playback.loop', 'must be a boolean')
    }
  }

  // Display
  if (raw.display !== undefined) {
    const d = raw.display
    if (!isObj(d)) c.add('display', 'must be an object')
    else {
      const r = d.iv_range
      if (r !== undefined && !(Array.isArray(r) && r.length === 2 && isNum(r[0]) && isNum(r[1]) && r[0] > 0 && r[1] > r[0]))
        c.add('display.iv_range', 'must be [lo, hi] with 0 < lo < hi')
      if (d.orbit_turns !== undefined && !(isNum(d.orbit_turns) && Number.isInteger(d.orbit_turns) && d.orbit_turns >= 0))
        c.add('display.orbit_turns', 'must be an integer >= 0')
    }
  }

  // Source
  if (!isObj(raw.source)) c.add('source', 'must be an object')
  else {
    if (!SOURCE_KINDS.includes(raw.source.kind as string)) c.add('source.kind', `must be one of ${SOURCE_KINDS.join(', ')}`)
    if (!isStr(raw.source.notice) || raw.source.notice === '') c.add('source.notice', 'must be a non-empty string')
  }

  return c.errors.length > 0 ? { ok: false, errors: c.errors } : { ok: true, value: raw as unknown as Sequence }
}

/** Parse JSON text. A syntax error (including Python's bare NaN token) is one error at path "". */
export function parseSequenceJson(text: string): ParseResult<Sequence> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `not valid JSON: ${(e as Error).message}` }] }
  }
  return parseSequence(raw)
}

export interface IndexEntry {
  id: string
  title: string
  file: string
}

const FILE_RE = /^[a-z0-9-]{1,64}\.json$/

/** public/data/index.json. `file` is a bare file name, so a dataset can never point at another URL. */
export function parseIndex(raw: unknown): ParseResult<IndexEntry[]> {
  const c = new Collector()
  if (!isObj(raw) || !Array.isArray(raw.datasets) || raw.datasets.length < 1) {
    c.add('datasets', 'must be a non-empty array')
    return { ok: false, errors: c.errors }
  }
  const out: IndexEntry[] = []
  raw.datasets.forEach((d, i) => {
    const p = `datasets[${i}]`
    if (!isObj(d)) return c.add(p, 'must be an object')
    if (!isStr(d.id) || !ID_RE.test(d.id)) c.add(`${p}.id`, 'must match /^[a-z0-9-]{1,64}$/')
    if (!isStr(d.title) || d.title === '') c.add(`${p}.title`, 'must be a non-empty string')
    if (!isStr(d.file) || !FILE_RE.test(d.file)) c.add(`${p}.file`, 'must be a bare file name like "name.json"')
    if (isStr(d.id) && isStr(d.title) && isStr(d.file)) out.push({ id: d.id, title: d.title, file: d.file })
  })
  return c.errors.length > 0 ? { ok: false, errors: c.errors } : { ok: true, value: out }
}
