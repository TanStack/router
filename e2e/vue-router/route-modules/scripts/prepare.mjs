import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Generator, getConfig } from '@tanstack/router-generator'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const provider = path.join(root, 'packages/settings')
await new Generator({
  config: getConfig({ disableLogging: true }, provider),
  root: provider,
}).run()
rmSync(path.join(provider, '.tanstack/types'), { recursive: true, force: true })
const result = spawnSync(
  'pnpm',
  ['exec', 'tsc', '-p', 'tsconfig.route-types.json', '--pretty', 'false'],
  { cwd: provider, stdio: 'inherit', shell: process.platform === 'win32' },
)
if (result.error) {
  throw result.error
}
if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
await new Generator({
  config: getConfig({ disableLogging: true }, root),
  root,
}).run()
