/** Worker settings for the CodSpeed memory instrument. */
export function memoryExecArgv() {
  if (
    process.env.CODSPEED_ENV === undefined ||
    process.env.CODSPEED_RUNNER_MODE !== 'memory'
  ) {
    return []
  }

  // Node 24 still enables Maglev under CodSpeed's --no-opt. Compile baseline
  // code eagerly and keep minor GC tied to allocations instead of tasks.
  return [
    '--no-maglev',
    '--always-sparkplug',
    '--no-minor-gc-task',
    '--initial-old-space-size=512',
  ]
}
