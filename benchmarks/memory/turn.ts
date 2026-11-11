export function isMemoryInstrumented() {
  return (
    process.env.CODSPEED_ENV !== undefined &&
    process.env.CODSPEED_RUNNER_MODE === 'memory'
  )
}

// CodSpeed calls beforeEach before its forced GC and measurement marker. End
// the previous warmup's job so WeakRef targets can be released by that GC.
export function endMemoryTurn() {
  return new Promise<void>((resolve) => setImmediate(resolve))
}

/**
 * Per-invocation bench hooks. CodSpeed runs them around every warmup
 * invocation and the measured one, outside the measurement marker: the turn
 * ends first, then the workload prepares fresh state before the forced GC.
 */
export function memoryBenchHooks(
  workload: {
    before?: () => Promise<void> | void
    after?: () => Promise<void> | void
  } = {},
) {
  return {
    async beforeEach() {
      if (isMemoryInstrumented()) {
        await endMemoryTurn()
      }
      await workload.before?.()
    },
    afterEach: workload.after,
  }
}
