import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { memoryCoordinatorExecArgv } from './runtime.ts'

const [side, framework, ...args] = process.argv.slice(2)
if (
  (side !== 'client' && side !== 'server') ||
  !['react', 'solid', 'vue'].includes(framework ?? '')
) {
  throw new Error(
    'Usage: node benchmarks/memory/run.ts <client|server> <react|solid|vue>',
  )
}

if (!process.execve) {
  throw new Error(
    'Memory benchmarks require Node 24 with process.execve support',
  )
}

const directory = fileURLToPath(new URL(`./${side}/`, import.meta.url))
const require = createRequire(join(directory, 'package.json'))
const { getV8Flags } = (await import(
  pathToFileURL(require.resolve('@codspeed/core')).href
)) as {
  getV8Flags: () => Array<string>
}
const vitest = join(
  dirname(require.resolve('vitest/package.json')),
  'vitest.mjs',
)

// The memory instrument tracks the process tree, including the coordinator.
// Replace this launcher so no Node/Nx/pnpm parent can collect or compile while
// the worker is measured. Builds remain in the workflow's preceding Nx step.
process.chdir(directory)
process.execve(
  process.execPath,
  [
    process.execPath,
    ...memoryCoordinatorExecArgv(),
    ...getV8Flags(),
    vitest,
    'bench',
    '--config',
    `vitest.${framework}.config.ts`,
    ...args,
  ],
  Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  ),
)
