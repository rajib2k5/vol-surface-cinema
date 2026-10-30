/**
 * The `frames-json` export: every timeline frame baked to a plain IV grid, for the Blender script.
 * It uses the same pure modules as the page (frameAt, interpolateIv, dateCaption, activeEvents), so the
 * timeline and the interpolation exist only in TypeScript. No browser, no ffmpeg.
 *
 * Pure: the files are read through injected functions.
 */
import { dateCaption } from '../../src/lib/captions.ts'
import { parseIndex, parseSequenceJson, type Sequence } from '../../src/lib/contract.ts'
import { activeEvents, eventsFromSequence } from '../../src/lib/events.ts'
import { sequenceIvExtent } from '../../src/lib/extent.ts'
import { interpolateIv, makeIvBuffer, precomputeW } from '../../src/lib/interpolate.ts'
import { frameAt, specFromSequence, totalFrames } from '../../src/lib/timeline.ts'
import { checkFrameCount, resolveFps } from './args.ts'

export interface FramesDoc {
  schema: 'vol-surface-cinema/frames-json'
  schema_version: 1
  id: string
  /** The dataset's badge: the data notice that must stay on screen in the render too. */
  badge: string
  fps: number
  width: number
  height: number
  grid: { k: number[]; dte: number[] }
  /** The fixed [lo, hi] IV scale of the whole sequence. */
  extent: [number, number]
  frames: { n: number; iv: number[][]; caption: string; events: { label: string; opacity: number }[] }[]
}

const round6 = (x: number): number => Math.round(x * 1e6) / 1e6

export function buildFramesDoc(seq: Sequence, fps: number, size: { width: number; height: number }): FramesDoc {
  const spec = specFromSequence(seq, fps)
  const total = totalFrames(spec)
  const wg = precomputeW(seq)
  const buf = makeIvBuffer(wg.nT, wg.nK)
  const events = eventsFromSequence(seq, fps)
  const dates = seq.frames.map((f) => f.date)
  const [lo, hi] = sequenceIvExtent(seq)
  const frames: FramesDoc['frames'] = []
  for (let n = 0; n < total; n++) {
    const st = frameAt(spec, n)
    interpolateIv(wg, st.i, st.j, st.alpha, buf)
    frames.push({
      n,
      iv: buf.map((row) => row.map(round6)),
      caption: dateCaption(st, dates),
      events: activeEvents(spec, events, n).map((a) => ({ label: events[a.index].label, opacity: a.opacity })),
    })
  }
  return {
    schema: 'vol-surface-cinema/frames-json',
    schema_version: 1,
    id: seq.id,
    badge: seq.badge,
    fps,
    width: size.width,
    height: size.height,
    grid: seq.grid,
    extent: [lo, hi],
    frames,
  }
}

export interface FramesJsonRequest {
  dataset: string | null
  fps: number | null
  size: { width: number; height: number }
  maxFrames: number
  /** The text of public/data/index.json. */
  readIndex(): string
  /** The text of a dataset file named by the index, or null when it is missing. */
  readDataset(file: string): string | null
}

export type FramesJsonResult = { ok: true; text: string } | { ok: false; code: 2 | 4; message: string }

/** Exit code 2: the request is wrong (unknown id, too many frames). Exit code 4: the data could not be read or is invalid. */
export function exportFramesJson(req: FramesJsonRequest): FramesJsonResult {
  let indexRaw: unknown
  try {
    indexRaw = JSON.parse(req.readIndex())
  } catch (e) {
    return { ok: false, code: 4, message: `index.json is not valid JSON: ${(e as Error).message}` }
  }
  const index = parseIndex(indexRaw)
  if (!index.ok) return { ok: false, code: 4, message: `index.json is invalid: ${index.errors[0].path}: ${index.errors[0].message}` }
  const entry = req.dataset === null ? index.value[0] : index.value.find((e) => e.id === req.dataset)
  if (!entry) return { ok: false, code: 2, message: `dataset "${req.dataset}" is not in index.json (known: ${index.value.map((e) => e.id).join(', ')})` }
  const text = req.readDataset(entry.file)
  if (text === null) return { ok: false, code: 4, message: `${entry.file} could not be read` }
  const parsed = parseSequenceJson(text)
  if (!parsed.ok) return { ok: false, code: 4, message: `${entry.file} does not match the surface-sequence contract: ${parsed.errors[0].path}: ${parsed.errors[0].message}` }
  const seq = parsed.value
  if (seq.id !== entry.id) return { ok: false, code: 4, message: `${entry.file} has id "${seq.id}" but index.json lists it as "${entry.id}"` }

  const fps = resolveFps('frames-json', req.fps, seq.playback?.fps)
  const total = totalFrames(specFromSequence(seq, fps))
  const tooMany = checkFrameCount(total, req.maxFrames)
  if (tooMany) return { ok: false, code: 2, message: tooMany }
  return { ok: true, text: JSON.stringify(buildFramesDoc(seq, fps, req.size)) + '\n' }
}
