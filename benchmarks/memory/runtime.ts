import { fileURLToPath } from 'node:url'
import { benchTestTimeout } from '../cpu-simulation'
import { isMemoryInstrumented } from './turn'

/** Worker settings for the CodSpeed memory instrument. */
export function memoryExecArgv() {
  if (!isMemoryInstrumented()) {
    return []
  }

  // CodSpeed supplies --no-opt, which only disables TurboFan on Node 24.
  // Under --predictable, Maglev compilations run synchronously inside the
  // request that triggers them, and the forced GC before the measured call can
  // discard optimized code so recompiles land in the measured window. Their
  // malloc'd Zone scratch (32 KiB segments) then dominates allocation metrics
  // and depends on per-process feedback state.
  // Limit variation from GC scheduling and bytecode reclamation; keep a
  // fixed initial old-generation budget.
  return [
    '--no-maglev',
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
    testTimeout: benchTestTimeout,
    setupFiles:
      side === 'client'
        ? [fileURLToPath(new URL('./client/vitest.setup.ts', import.meta.url))]
        : [],
  }
}
