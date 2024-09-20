import { readdir } from 'node:fs/promises'

export async function isEmptyDirectory(path: string) {
  const files = await readdir(path)
  return files.length === 0 || (files.length === 1 && files[0] === '.git')
}
