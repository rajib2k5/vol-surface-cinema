/**
 * The temporary output of one export run. The name is unique per run and the file is created with O_EXCL
 * (flag "wx"), so a file the user already has is never opened, overwritten or later deleted by abort().
 */
import { randomBytes } from 'node:crypto'
import { open } from 'node:fs/promises'
import { partialPath } from './paths.ts'

export interface ReserveOptions {
  token?: () => string
  /** Must fail with code EEXIST when the file exists, and create it empty otherwise. */
  create?: (path: string) => Promise<void>
  tries?: number
}

export async function createExclusive(path: string): Promise<void> {
  const handle = await open(path, 'wx')
  await handle.close()
}

const randomToken = () => `${process.pid}-${randomBytes(6).toString('hex')}`

/** Creates an empty file for this run's temporary output and returns its path. */
export async function reservePartial(out: string, o: ReserveOptions = {}): Promise<string> {
  const token = o.token ?? randomToken
  const create = o.create ?? createExclusive
  const tries = o.tries ?? 5
  for (let i = 0; i < tries; i++) {
    const candidate = partialPath(out, token())
    try {
      await create(candidate)
      return candidate
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    }
  }
  throw new Error(`could not find a unique temporary file name beside ${out}`)
}
