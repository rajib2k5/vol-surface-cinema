/** Write a file via a temporary file beside it and a rename, so a reader (or a crash) never sees half a file. */
import { rename, rm, writeFile } from 'node:fs/promises'
import { reservePartial } from '../export/partial.ts'

export async function writeFileAtomic(target: string, text: string): Promise<void> {
  const tmp = await reservePartial(target)
  try {
    await writeFile(tmp, text)
    await rename(tmp, target)
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
}
