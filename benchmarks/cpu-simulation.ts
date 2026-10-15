function codspeedRunnerMode() {
  return process.env.CODSPEED_ENV === undefined
    ? undefined
    : process.env.CODSPEED_RUNNER_MODE
}

/**
 * Whether CodSpeed's simulation or memory instrument drives the run. Both
 * measure one invocation after a few warmup calls instead of sampling.
 */
export function isCodSpeedAnalysis() {
  const mode = codspeedRunnerMode()
  return (
    mode === 'simulation' || mode === 'instrumentation' || mode === 'memory'
  )
}

/** Extra worker flags for CodSpeed CPU simulation, not walltime benchmarks. */
export function cpuSimulationExecArgv() {
  const mode = codspeedRunnerMode()
  if (mode === 'simulation' || mode === 'instrumentation') {
    // CodSpeed supplies --no-opt, which only disables TurboFan on Node 24.
    // Maglev can still compile and inline hot functions between measured runs.
    // Compile baseline code on first use, so warmup does not leave functions
    // near Sparkplug's later tier-up/batch-compilation thresholds.
    // V8 renamed --scavenge-task in Node 20; CodSpeed's old flag is omitted.
    // Keep minor GC tied to allocations instead of scheduled foreground tasks.
    // Fix the initial/minimum old-generation allocation budget. This can skip
    // automatic full collections below the budget; minor GC remains enabled.
    return [
      '--no-maglev',
      '--always-sparkplug',
      '--no-minor-gc-task',
      '--initial-old-space-size=512',
    ]
  }
  return []
}

/**
 * Vitest 5 runs benchmarks inside tests with at least a 60 s timeout.
 * Instrumented CodSpeed runs are far slower than native ones, so allow each
 * benchmark test up to 10 minutes.
 */
export const benchTestTimeout = 10 * 60_000

/**
 * Per-bench lifecycle for apps that a bench prepares and disposes outside
 * timing. CodSpeed measures one invocation, so each invocation gets fresh
 * state. Tinybench samples thousands of iterations and keeps one instance per
 * warmup/run phase instead of preparing it for every iteration.
 */
export function benchLifecycle(hooks: {
  before: () => Promise<void> | void
  after: () => Promise<void> | void
}) {
  return isCodSpeedAnalysis()
    ? { beforeEach: hooks.before, afterEach: hooks.after }
    : { beforeAll: hooks.before, afterAll: hooks.after }
}
