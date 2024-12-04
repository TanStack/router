import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

export function getModuleDir(importMetaUrl: string): string {
  const __filename = fileURLToPath(importMetaUrl)
  const __dirname = dirname(__filename)
  return resolve(__dirname, '../../src/modules')
}
