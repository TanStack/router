import { fileURLToPath } from 'node:url'
import { isMemoryInstrumented } from './turn'

/** Worker settings for the CodSpeed memory instrument. */
export function memoryExecArgv(side: 'client' | 'server') {
  if (!isMemoryInstrumented()) {
    return []
  }

  // Both environments need a fixed initial old-generation budget.
  const execArgv = ['--initial-old-space-size=512']
  if (side === 'client') {
    // DOM workloads also need to suppress GC and bytecode reclamation noise.
    execArgv.unshift(
      '--no-flush-bytecode',
      '--no-minor-gc-task',
      '--no-incremental-marking',
    )
  }
  return execArgv
}

export function memoryConfig(side: 'client' | 'server') {
  const execArgv = memoryExecArgv(side)
  return {
    execArgv,
    setupFiles:
      side === 'client' || isMemoryInstrumented()
        ? [fileURLToPath(new URL(`./${side}/vitest.setup.ts`, import.meta.url))]
        : [],
  }
}
