import { fileURLToPath } from 'node:url'
import { isMemoryInstrumented } from './turn'

/** Worker settings for the CodSpeed memory instrument. */
export function memoryExecArgv() {
  if (!isMemoryInstrumented()) {
    return []
  }

  // Keep machine-code generation out of native allocation measurements and GC
  // tied to allocations instead of event-loop tasks and marking time budgets.
  return [
    '--jitless',
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
