import { spawnCommand } from './spawnCmd'
import type { PackageManager } from '../constants'

export async function runPackageManagerCommand(
  packageManager: PackageManager,
  args: Array<string>,
  env: NodeJS.ProcessEnv = {},
  cwd?: string,
) {
  return spawnCommand(packageManager, args, env, cwd)
}

export async function install(packageManager: PackageManager, cwd?: string) {
  return runPackageManagerCommand(
    packageManager,
    ['install'],
    {
      NODE_ENV: 'development',
    },
    cwd,
  )
}

export async function build(packageManager: PackageManager, cwd?: string) {
  return runPackageManagerCommand(packageManager, ['run', 'build'], {}, cwd)
}
