// Generates routes and builds declarations in dependency order using the
// fixture packages' ordinary TypeScript build.
//
// The modules list `@tanstack/router-core` as a dev dependency only because
// the fixture links `@tanstack/react-router` from the workspace: TypeScript
// names the types of a linked package's dependencies by their own package
// name. Installed from a registry, the declarations name them through
// `@tanstack/react-router`, the only router package modules need.
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Generator, getConfig } from '@tanstack/router-generator'

const packages = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../packages',
)

const tsc = path.resolve(
  packages,
  '../../../../node_modules/.bin',
  process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
)

for (const name of [
  'products',
  'storefront',
  'account',
  'team',
  'settings',
  'billing',
]) {
  const root = path.join(packages, name)
  const config = getConfig({ disableLogging: true }, root)
  await new Generator({ config, root }).run()
  rmSync(path.join(root, '.tanstack/types'), { recursive: true, force: true })
  const result = spawnSync(
    tsc,
    ['-p', 'tsconfig.route-types.json', '--pretty', 'false'],
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
  )
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
