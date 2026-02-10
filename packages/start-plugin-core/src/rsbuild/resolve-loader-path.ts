import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'pathe'

/**
 * Resolve a local loader path to emitted JS when present, otherwise TS source.
 */
export function resolveLoaderPath(relativePath: string): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const basePath = path.resolve(currentDir, relativePath)
  const jsPath = `${basePath}.js`
  const tsPath = `${basePath}.ts`

  if (fs.existsSync(jsPath)) return jsPath
  if (fs.existsSync(tsPath)) return tsPath

  return jsPath
}
