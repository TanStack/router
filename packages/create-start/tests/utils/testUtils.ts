import { join } from 'node:path'
import { stat } from 'node:fs/promises'

export async function existsInDirectory(
  file: string,
  dir: string,
): Promise<boolean> {
  const fullPath = join(dir, file)
  try {
    const stats = await stat(fullPath)
    return stats.isFile()
  } catch {
    return false
  }
}