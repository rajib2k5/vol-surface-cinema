/**
 * The last step of an export: put the finished temporary file under the output name.
 *
 * Without --force the name is checked at the moment of publishing, not only at argument parsing: a file
 * that appeared during the run must survive. link() fails with EEXIST atomically, so it never replaces.
 * Where hard links are not available (EPERM, EXDEV, ENOTSUP...), copyFile with COPYFILE_EXCL gives the same refusal.
 * With --force the temporary file is renamed over the output.
 */
import { constants } from 'node:fs'
import { copyFile, link, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { reservePartial } from './partial.ts'

export class OutputExistsError extends Error {
  constructor(out: string) {
    super(`${out} was created while the export was running; it was left as it is (use --force to overwrite)`)
    this.name = 'OutputExistsError'
  }
}

export interface PublishFs {
  rename(from: string, to: string): Promise<void>
  link(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
  copyFile(from: string, to: string, mode?: number): Promise<void>
}

const realFs: PublishFs = { rename, link, unlink, copyFile }

/** link() errors that mean "no hard links here", as opposed to a real failure. */
const NO_LINK = new Set(['EPERM', 'EXDEV', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EMLINK'])
const codeOf = (e: unknown) => (e as NodeJS.ErrnoException).code ?? ''

/** On OutputExistsError the temporary file is removed here; on any other error it is left for the caller to remove. */
export async function publishFile(temp: string, out: string, force: boolean, fs: PublishFs = realFs): Promise<void> {
  if (force) return fs.rename(temp, out)
  try {
    await fs.link(temp, out)
  } catch (e) {
    const code = codeOf(e)
    if (code === 'EEXIST') {
      await rm(temp, { force: true })
      throw new OutputExistsError(out)
    }
    if (!NO_LINK.has(code)) throw e
    try {
      await fs.copyFile(temp, out, constants.COPYFILE_EXCL)
    } catch (e2) {
      if (codeOf(e2) === 'EEXIST') {
        await rm(temp, { force: true })
        throw new OutputExistsError(out)
      }
      throw e2
    }
  }
  await fs.unlink(temp)
}

/** Writes `text` to `out` through a temporary file this run created, so a failed run leaves no half file. */
export async function writeViaPartial(out: string, text: string, force: boolean, fs: PublishFs = realFs): Promise<void> {
  const partial = await reservePartial(out)
  try {
    await writeFile(partial, text)
    await publishFile(partial, out, force, fs)
  } catch (e) {
    await rm(partial, { force: true }).catch(() => undefined)
    throw e
  }
}
