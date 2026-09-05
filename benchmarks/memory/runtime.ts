/** Worker settings for the CodSpeed memory instrument. */
export function memoryExecArgv() {
  if (
    process.env.CODSPEED_ENV === undefined ||
    process.env.CODSPEED_RUNNER_MODE !== 'memory'
  ) {
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
