/** Page URL parameters: ?dataset=<id>&export=1&w=<px>&h=<px>&fps=<n>. Invalid values are ignored, never trusted. */

export interface Query {
  /** A valid dataset id, or null (absent, or rejected: see invalidDataset). */
  dataset: string | null
  /** The raw ?dataset= value when it failed the id rule, so the page can name it instead of silently loading the default. */
  invalidDataset: string | null
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
  const valid = dataset !== null && ID_RE.test(dataset)
  return {
    dataset: valid ? dataset : null,
    invalidDataset: dataset !== null && !valid ? dataset : null,
    export: p.get('export') === '1',
    width: int(p.get('w'), 16, 4096),
    height: int(p.get('h'), 16, 4096),
    fps: int(p.get('fps'), 1, 60),
  }
}

const MAX_NAMED = 64

/** The message for a ?dataset= value that failed the id rule, or null. Plain text: callers must show it with textContent. */
export function datasetProblem(q: Pick<Query, 'invalidDataset'>): string | null {
  if (q.invalidDataset === null) return null
  const v = q.invalidDataset
  const shown = v.length > MAX_NAMED ? `${v.slice(0, MAX_NAMED)}…` : v
  return `Dataset ${JSON.stringify(shown)} is not a valid dataset id (use a-z, 0-9 and -, 1 to 64 characters)`
}

/** The link that selects a dataset in the menu. Only a plain id is accepted, so nothing else can ride along. */
export function datasetHref(id: string): string {
  if (!ID_RE.test(id)) throw new RangeError(`not a dataset id: ${JSON.stringify(id)}`)
  return `?dataset=${id}`
}
