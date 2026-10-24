import { readFile } from 'node:fs/promises'
import { createJiti } from 'jiti'
import { replaceBackslash } from '../../utils'
import type { ModuleCache } from 'jiti'

export async function loadConfigFile(filePath: string) {
  // Match Jiti's resolved import paths so cycles share the entry module cache.
  filePath = replaceBackslash(filePath)
  const jiti = createJiti(filePath, {
    interopDefault: false,
    moduleCache: false,
    tryNative: false,
    tsconfigPaths: true,
  })
  // Keep the evaluated import graph local to this generation for file watching.
  const cache: ModuleCache = {}
  const source = await readFile(filePath, 'utf8')
  const loaded = await jiti.evalModule(source, {
    filename: filePath,
    async: true,
    cache,
  })
  return { exports: loaded as any, cache }
}
