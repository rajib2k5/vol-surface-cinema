/**
 * Loads a dataset by id: fetch index.json, look the id up in it, fetch that one file, validate.
 * The id must be in the index, so the page never fetches an arbitrary URL. `fetchFn` is injectable
 * so a test can fake the network.
 */
import { parseIndex, parseSequenceJson, type ContractError, type IndexEntry, type Sequence } from './contract.ts'

export class DatasetError extends Error {
  errors: ContractError[]
  constructor(message: string, errors: ContractError[] = []) {
    super(message)
    this.name = 'DatasetError'
    this.errors = errors
  }
}

async function getText(fetchFn: typeof fetch, url: string): Promise<string> {
  let res: Response
  try {
    res = await fetchFn(url)
  } catch (e) {
    throw new DatasetError(`Could not fetch ${url}: ${(e as Error).message}`)
  }
  if (!res.ok) throw new DatasetError(`Could not fetch ${url}: HTTP ${res.status}`)
  return res.text()
}

export interface LoadedDataset {
  sequence: Sequence
  index: IndexEntry[]
}

const MAX_SHOWN = 10

export async function loadDataset(id: string | null, fetchFn: typeof fetch = fetch, baseUrl = './data/'): Promise<LoadedDataset> {
  const indexUrl = `${baseUrl}index.json`
  const indexText = await getText(fetchFn, indexUrl)
  let indexRaw: unknown
  try {
    indexRaw = JSON.parse(indexText)
  } catch (e) {
    throw new DatasetError(`${indexUrl} is not valid JSON: ${(e as Error).message}`)
  }
  const parsedIndex = parseIndex(indexRaw)
  if (!parsedIndex.ok) throw new DatasetError(`${indexUrl} is invalid`, parsedIndex.errors.slice(0, MAX_SHOWN))
  const index = parsedIndex.value

  const entry = id === null ? index[0] : index.find((e) => e.id === id)
  if (!entry) throw new DatasetError(`Dataset "${id}" is not in index.json (known: ${index.map((e) => e.id).join(', ')})`)

  const url = `${baseUrl}${entry.file}`
  const parsed = parseSequenceJson(await getText(fetchFn, url))
  if (!parsed.ok) throw new DatasetError(`${url} does not match the surface-sequence contract`, parsed.errors.slice(0, MAX_SHOWN))
  if (parsed.value.id !== entry.id)
    throw new DatasetError(`${url} has id "${parsed.value.id}" but index.json lists it as "${entry.id}"`, [{ path: 'id', message: 'must equal the index id' }])
  return { sequence: parsed.value, index }
}
