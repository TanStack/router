/** Worker settings for the CodSpeed memory instrument. */
export function memoryExecArgv() {
  if (
    process.env.CODSPEED_ENV === undefined ||
    process.env.CODSPEED_RUNNER_MODE !== 'memory'
  ) {
    return []
  }

  // Keep machine-code generation out of native allocation measurements and minor GC
  // tied to allocations instead of tasks.
  return [
    '--jitless',
    '--no-flush-bytecode',
    '--no-minor-gc-task',
    '--initial-old-space-size=512',
  ]
}
