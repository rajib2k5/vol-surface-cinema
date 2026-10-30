import type { Extent } from './surfaceGeometry.ts'
import type { Sequence } from './contract.ts'

/** The fixed vertical scale of a sequence: display.iv_range, else the global min and max over every frame. */
export function sequenceIvExtent(seq: Sequence): Extent {
  if (seq.display?.iv_range) return [seq.display.iv_range[0], seq.display.iv_range[1]]
  let lo = Infinity
  let hi = -Infinity
  for (const f of seq.frames)
    for (const row of f.iv)
      for (const v of row) {
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
  return [lo, hi]
}
