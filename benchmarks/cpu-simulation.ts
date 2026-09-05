/** Extra worker flags for CodSpeed CPU simulation, not walltime benchmarks. */
export function cpuSimulationExecArgv() {
  const mode =
    process.env.CODSPEED_ENV === undefined
      ? undefined
      : process.env.CODSPEED_RUNNER_MODE
  if (mode === 'simulation' || mode === 'instrumentation') {
    // CodSpeed supplies --no-opt, which only disables TurboFan on Node 24.
    // Maglev can still compile and inline hot functions between measured runs.
    // Compile baseline code on first use, so warmup does not leave functions
    // near Sparkplug's later tier-up/batch-compilation thresholds.
    // V8 renamed --scavenge-task in Node 20; CodSpeed's old flag is omitted.
    // Keep minor GC tied to allocations instead of scheduled foreground tasks.
    // Incremental marking tasks also use wall-clock completion deadlines in
    // predictable mode. Allocation-triggered marking can still run normally.
    return [
      '--no-maglev',
      '--always-sparkplug',
      '--no-minor-gc-task',
      '--no-incremental-marking-task',
    ]
  }
  return []
}
