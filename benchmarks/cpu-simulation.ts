/** Extra worker flags for CodSpeed CPU simulation, not walltime benchmarks. */
export function cpuSimulationExecArgv() {
  const mode =
    process.env.CODSPEED_ENV === undefined
      ? undefined
      : process.env.CODSPEED_RUNNER_MODE
  if (mode === 'simulation' || mode === 'instrumentation') {
    // Match CodSpeed's Node 24 fixes: --no-opt leaves Maglev enabled, and
    // V8 renamed --scavenge-task to --minor-gc-task in Node 20.
    // Keep a fixed minimum old-generation allocation budget.
    return [
      '--no-maglev',
      '--no-minor-gc-task',
      '--initial-old-space-size=512',
    ]
  }
  return []
}
