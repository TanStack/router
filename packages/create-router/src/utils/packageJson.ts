import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

async function readPackageJson() {
  const PACKAGE_JSON_FILE = resolve(
    fileURLToPath(import.meta.url),
    '../../package.json',
  )
  const packageJson = await readFile(PACKAGE_JSON_FILE, 'utf-8')
  return JSON.parse(packageJson)
}

export const packageJson = await readPackageJson()
