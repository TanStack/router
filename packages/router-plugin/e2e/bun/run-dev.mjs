import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

if (!process.env.BUN_EXECUTABLE) {
  throw new Error('Set BUN_EXECUTABLE to the native development candidate')
}
let repo = path.dirname(fileURLToPath(import.meta.url))
while (!existsSync(path.join(repo, 'packages/router-plugin/package.json'))) {
  const parent = path.dirname(repo)
  if (parent === repo) {
    throw new Error('Run this harness inside the Router repository')
  }
  repo = parent
}
const requirePlugin = createRequire(
  path.join(repo, 'packages/router-plugin/package.json'),
)
const config = fileURLToPath(
  new URL('./dev-playwright.config.ts', import.meta.url),
)
const executable = process.env.BUN_EXECUTABLE
const preload = process.env.BUN_PLUGIN_PRELOAD
const child = spawn(
  process.execPath,
  [
    requirePlugin.resolve('@playwright/test/cli'),
    'test',
    '--config',
    config,
    ...process.argv.slice(2),
  ],
  {
    cwd: path.join(repo, 'packages/router-plugin'),
    env: {
      ...process.env,
      ROUTER_REPOSITORY_ROOT: repo,
      BUN_EXECUTABLE: /[\\/]/.test(executable)
        ? path.resolve(executable)
        : executable,
      BUN_PLUGIN_PRELOAD:
        preload && !preload.startsWith('file:')
          ? path.resolve(preload)
          : preload,
    },
    stdio: 'inherit',
    windowsHide: true,
  },
)
child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1)
})
