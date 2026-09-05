import { fileURLToPath } from 'node:url'
import { isMemoryInstrumented } from './turn.ts'

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

export function memoryCoordinatorExecArgv() {
  // Vite's lexer needs WebAssembly, which --jitless disables. Compile the
  // coordinator's baseline code eagerly; the benchmark workers stay jitless.
  return memoryExecArgv().flatMap((flag) =>
    flag === '--jitless' ? ['--no-maglev', '--always-sparkplug'] : [flag],
  )
}

export function memoryConfig(side: 'client' | 'server') {
  const execArgv = memoryExecArgv()
  return {
    execArgv,
    setupFiles:
      side === 'client' || execArgv.length
        ? [fileURLToPath(new URL(`./${side}/vitest.setup.ts`, import.meta.url))]
        : [],
  }
}
