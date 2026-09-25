import { fileURLToPath } from 'node:url'
import { isMemoryInstrumented } from './turn'

/** Worker settings for the CodSpeed memory instrument. */
export function memoryExecArgv() {
  if (!isMemoryInstrumented()) {
    return []
  }

  // Limit variation from GC scheduling and bytecode reclamation; keep a
  // fixed initial old-generation budget.
  return [
    '--no-flush-bytecode',
    '--no-minor-gc-task',
    '--no-incremental-marking',
    '--initial-old-space-size=512',
  ]
}

export function memoryConfig(side: 'client' | 'server') {
  const execArgv = memoryExecArgv()
  return {
    execArgv,
    setupFiles:
      side === 'client' || isMemoryInstrumented()
        ? [fileURLToPath(new URL(`./${side}/vitest.setup.ts`, import.meta.url))]
        : [],
  }
}
