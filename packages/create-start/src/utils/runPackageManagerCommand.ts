import spawn from 'cross-spawn'
import type { PackageManager } from '../constants'

export async function runPackageManagerCommand(
  packageManager: PackageManager,
  args: Array<string>,
  env: NodeJS.ProcessEnv = {},
  cwd?: string,
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(packageManager, args, {
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
    })
    let stderrBuffer = ''
    let stdoutBuffer = ''

    child.stderr?.on('data', (data) => {
      stderrBuffer += data
    })

    child.stdout?.on('data', (data) => {
      stdoutBuffer += data
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          `"${packageManager} ${args.join(' ')}" failed ${stdoutBuffer} ${stderrBuffer}`,
        )
        return
      }
      resolve()
    })
  })
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
