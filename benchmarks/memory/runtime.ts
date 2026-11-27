import { fileURLToPath } from 'node:url'
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
  //
  // Node 26's scavenger posts its job to a platform worker before the main
  // thread scans roots, so two scavengers race even with CodSpeed's
  // --single-threaded-gc. Their worklist segments and pretenuring maps are
  // malloc'd, so every young GC in the measured window adds run-dependent
  // allocations. Minor mark-sweep runs on the main thread under
  // --single-threaded-gc. The page pool is released by a wall-clock timer task.
  return [
    '--minor-ms',
    '--no-memory-pool',
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
    setupFiles:
      side === 'client'
        ? [fileURLToPath(new URL('./client/vitest.setup.ts', import.meta.url))]
        : [],
  }
}
