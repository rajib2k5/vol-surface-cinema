/**
 * Pure conversion of vol-strategy-backtester's surface_frames.json into a surface-sequence v1 document.
 *
 * Kept from the source: the grid, and per frame the date, iv, cell_flags and quoted_share; plus the
 * run ids and the source commit as provenance. NOT kept: spot (Yahoo), vix_close (Cboe), atm_iv_30d,
 * expiries_used, the source's labels and timestamps. The player does not use them, and VIX closes
 * are Cboe data whose terms bar redistribution. Labels and events are our own words, with no figure.
 *
 * Pure: no I/O. scripts/import-backtester-frames.ts reads and writes the files.
 */
import { parseSequence, type Sequence } from '../../src/lib/contract.ts'
import { butterflyGridCheck, calendarGridCheck, type ButterflyCheck, type CalendarCheck } from '../../src/lib/gridChecks.ts'

export const OUTPUT_ID = 'optionsdx-spy-4dates'

export class ImportError extends Error {
  problems: string[]
  constructor(problems: string[]) {
    super(`import refused: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` (and ${problems.length - 5} more)` : ''}`)
    this.name = 'ImportError'
    this.problems = problems
  }
}

/** The four dates of the frozen source file, with our words for each. Any other date is refused. */
const DATES: { date: string; label: string; event: { label: string; kind: 'shock' | 'note' } | null }[] = [
  { date: '2017-11-03', label: 'calm, late 2017', event: null },
  { date: '2018-02-05', label: 'February 2018 volatility spike', event: { label: 'February 2018 volatility spike', kind: 'shock' } },
  { date: '2020-03-16', label: 'March 2020 crash', event: { label: 'March 2020 crash', kind: 'shock' } },
  { date: '2023-06-15', label: 'mid-2023', event: { label: 'Mid-2023', kind: 'note' } },
]

const ID_TEXT_RE = /^[A-Za-z0-9._-]{1,128}$/
const COMMIT_RE = /^[0-9a-f]{7,40}(-dirty)?$/

const BADGE = 'SPY implied vols derived from OptionsDX quotes (via Kaggle). Interpolated between dates.'
const NOTICE =
  'SPY implied vols derived from OptionsDX end-of-day quotes, obtained through the Kaggle dataset ' +
  'dudesurfin/spy-options-eod-volatility-surface-2010-2023 (Kaggle lists MIT; no OptionsDX terms were found). ' +
  "The vols were computed by vol-strategy-backtester's pricing build. Derived grid values only, no quote rows. " +
  "This data is not covered by this repository's MIT licence. Shown as exported: not arbitrage-repaired. " +
  'Frames between the four dates are interpolated, not observed. See DATA.md.'

export interface FrameReport {
  date: string
  quotedShare: number
  calendar: CalendarCheck
  butterfly: ButterflyCheck
}

export interface ConvertResult {
  sequence: Sequence
  report: { frames: FrameReport[] }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function axis(p: string[], name: string, v: unknown): number[] {
  if (!Array.isArray(v) || v.length < 2 || !v.every(isNum)) {
    p.push(`${name} must be an array of at least 2 finite numbers`)
    return []
  }
  return v.slice()
}

function grid(p: string[], path: string, v: unknown, nT: number, nK: number): number[][] {
  if (!Array.isArray(v) || v.length !== nT || v.some((r) => !Array.isArray(r) || r.length !== nK || !r.every(isNum))) {
    p.push(`${path} must be a ${nT} x ${nK} grid of finite numbers`)
    return []
  }
  return v.map((r: number[]) => r.slice())
}

export function convertFrames(raw: unknown): ConvertResult {
  const p: string[] = []
  if (!isObj(raw)) throw new ImportError(['the source must be a JSON object'])

  const k = axis(p, 'grid_moneyness', raw.grid_moneyness)
  const dte = axis(p, 'grid_dte', raw.grid_dte)

  const run = isObj(raw.run) ? raw.run : null
  if (!run) p.push('run must be an object')
  const ids = { run_id: run?.run_id, config_hash: run?.config_hash, data_fingerprint: run?.data_fingerprint }
  for (const [name, v] of Object.entries(ids)) if (typeof v !== 'string' || !ID_TEXT_RE.test(v)) p.push(`run.${name} must match ${ID_TEXT_RE}`)
  if (typeof raw.source_commit !== 'string' || !COMMIT_RE.test(raw.source_commit)) p.push('source_commit must be a hex commit hash, optionally ending in -dirty')

  const srcFrames = Array.isArray(raw.frames) ? raw.frames : null
  if (!srcFrames) p.push('frames must be an array')
  else if (srcFrames.length !== DATES.length) p.push(`expected ${DATES.length} frames, got ${srcFrames.length}`)

  const frames: Sequence['frames'] = []
  if (srcFrames && k.length && dte.length)
    srcFrames.forEach((f: unknown, t: number) => {
      const at = `frames[${t}]`
      if (!isObj(f)) return p.push(`${at} must be an object`)
      const known = DATES[t]
      if (!known || f.date !== known.date) return p.push(`${at}.date ${JSON.stringify(f.date)} is not the expected ${known?.date}`)
      const iv = grid(p, `${at}.iv`, f.iv, dte.length, k.length)
      const cell_flags = grid(p, `${at}.cell_flags`, f.cell_flags, dte.length, k.length)
      if (!isNum(f.quoted_share) || f.quoted_share < 0 || f.quoted_share > 1) p.push(`${at}.quoted_share must be a number in [0, 1]`)
      frames.push({ date: known.date, label: known.label, iv, cell_flags, quoted_share: f.quoted_share as number })
    })
  if (p.length > 0) throw new ImportError(p)

  const sequence: Sequence = {
    schema: 'vol-surface-cinema/surface-sequence',
    schema_version: 1,
    id: OUTPUT_ID,
    title: 'SPY implied vols on four real dates (OptionsDX-derived)',
    badge: BADGE,
    synthetic: false,
    grid: { k, dte },
    frames,
    events: DATES.flatMap((d) => (d.event ? [{ date: d.date, label: d.event.label, kind: d.event.kind }] : [])),
    playback: { fps: 30, hold_s: 1, transition_s: 2, easing: 'smoothstep', loop: false },
    source: {
      kind: 'derived',
      notice: NOTICE,
      source_commit: raw.source_commit as string,
      run: { run_id: ids.run_id as string, config_hash: ids.config_hash as string, data_fingerprint: ids.data_fingerprint as string },
      providers: [
        {
          name: 'OptionsDX, via the Kaggle dataset dudesurfin/spy-options-eod-volatility-surface-2010-2023',
          role: 'end-of-day SPY option quotes the implied vols were computed from',
          terms_url: 'https://www.kaggle.com/datasets/dudesurfin/spy-options-eod-volatility-surface-2010-2023',
          licence: 'Kaggle lists MIT. No OptionsDX terms found (the terms page returned 404 on 2026-10-29).',
        },
        {
          name: 'vol-strategy-backtester pricing build',
          role: 'computed the implied-vol grids from the quotes',
          terms_url: 'https://github.com/rajib2k5/vol-strategy-backtester',
          licence: 'MIT',
        },
      ],
    },
    licence: 'see DATA.md',
  }

  const parsed = parseSequence(sequence)
  if (!parsed.ok) throw new ImportError(parsed.errors.map((e) => `${e.path}: ${e.message}`))

  const report = {
    frames: frames.map((f) => ({
      date: f.date,
      quotedShare: f.quoted_share as number,
      calendar: calendarGridCheck(f.iv, dte),
      butterfly: butterflyGridCheck(f.iv, k, dte),
    })),
  }
  return { sequence, report }
}
