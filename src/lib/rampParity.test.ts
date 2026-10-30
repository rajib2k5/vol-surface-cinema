import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RAMP_STOPS } from './colorRamp.ts'

const py = readFileSync(new URL('../../tools/blender/render_surface_sequence.py', import.meta.url), 'utf8')

/** The (r, g, b) tuples of `_VIRIDIS = ( ... )` in the Blender script. */
function blenderStops(text: string): number[][] {
  const m = /^_VIRIDIS\s*=\s*\(([\s\S]*?)^\)/m.exec(text)
  if (!m) throw new Error('_VIRIDIS not found in render_surface_sequence.py')
  return [...m[1].matchAll(/\(([^()]*)\)/g)].map((t) => t[1].split(',').map((x) => Number(x.trim())))
}

describe('the colour ramp of the page and of the Blender script', () => {
  it('has the same 33 stops, value for value', () => {
    const stops = blenderStops(py)
    expect(stops).toHaveLength(33)
    expect(RAMP_STOPS).toHaveLength(33)
    expect(stops).toEqual(RAMP_STOPS.map((s) => [...s]))
  })
})
