import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export type MoveOutcome = 'moved' | 'missing' | 'already_existed' | 'errored'

export interface MoveEntry {
  imageName: string
  outcome: MoveOutcome
  error?: string
}

export interface MoveSummary {
  total: number
  moved: number
  missing: number
  already_existed: number
  errored: number
  entries: MoveEntry[]
  destination: string
}

export interface ProgressEvent {
  done: number
  total: number
  currentFilename: string
}

const TARGET_DIR_NAME = 'wybrane'

async function moveOne(srcDir: string, dstDir: string, imageName: string): Promise<MoveEntry> {
  const src = join(srcDir, imageName)
  const dst = join(dstDir, imageName)

  try {
    await fs.access(src)
  }
  catch {
    return { imageName, outcome: 'missing' }
  }

  try {
    await fs.access(dst)
    return { imageName, outcome: 'already_existed' }
  }
  catch {
    /* dst doesn't exist — continue */
  }

  try {
    await fs.rename(src, dst)
    return { imageName, outcome: 'moved' }
  }
  catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EXDEV') {
      try {
        await fs.copyFile(src, dst)
        await fs.unlink(src)
        return { imageName, outcome: 'moved' }
      }
      catch (copyErr) {
        return { imageName, outcome: 'errored', error: (copyErr as Error).message }
      }
    }
    return { imageName, outcome: 'errored', error: (err as Error).message }
  }
}

export async function moveSelectedImages(
  sourceFolder: string,
  imageNames: string[],
  onProgress: (e: ProgressEvent) => void,
): Promise<MoveSummary> {
  const destination = join(sourceFolder, TARGET_DIR_NAME)
  await fs.mkdir(destination, { recursive: true })

  const entries: MoveEntry[] = []
  const counts = { moved: 0, missing: 0, already_existed: 0, errored: 0 }
  const total = imageNames.length

  for (let i = 0; i < imageNames.length; i++) {
    const name = imageNames[i]!
    const entry = await moveOne(sourceFolder, destination, name)
    entries.push(entry)
    counts[entry.outcome]++
    onProgress({ done: i + 1, total, currentFilename: name })
  }

  return { total, ...counts, entries, destination }
}
