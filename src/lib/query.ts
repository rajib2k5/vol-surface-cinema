/** Page URL parameters: ?dataset=<id>&export=1&w=<px>&h=<px>&fps=<n>. Invalid values are ignored, never trusted. */

export interface Query {
  dataset: string | null
  export: boolean
  width: number | null
  height: number | null
  fps: number | null
}

const ID_RE = /^[a-z0-9-]{1,64}$/

function int(v: string | null, lo: number, hi: number): number | null {
  if (v === null || !/^\d+$/.test(v)) return null
  const n = Number(v)
  return n >= lo && n <= hi ? n : null
}

export function parseQuery(search: string): Query {
  const p = new URLSearchParams(search)
  const dataset = p.get('dataset')
  return {
    dataset: dataset !== null && ID_RE.test(dataset) ? dataset : null,
    export: p.get('export') === '1',
    width: int(p.get('w'), 16, 4096),
    height: int(p.get('h'), 16, 4096),
    fps: int(p.get('fps'), 1, 60),
  }
}
