import { afterEach, beforeEach, bench, describe } from 'vitest'
import { IsolatedMemoryProcess } from '../shared/isolated-process.ts'
import { memoryBenchOptions } from './bench-utils.ts'
import type { IsolatedMemoryBenchmarkKind } from '../shared/isolated-process.ts'

type RegisterIsolatedServerMemoryBenchmarksOptions = {
  names: Array<string>
  setupUrl: URL
}

const kind = 'server' satisfies IsolatedMemoryBenchmarkKind
const isolatedProcessSetupTimeout = 60_000

export function registerIsolatedServerMemoryBenchmarks(
  options: RegisterIsolatedServerMemoryBenchmarksOptions,
) {
  const isolatedProcess = new IsolatedMemoryProcess({
    kind,
    setupUrl: options.setupUrl,
    workloadNames: options.names,
  })

  const run = async (workloadIndex: number) => {
    try {
      await isolatedProcess.run(workloadIndex)
    } catch (error) {
      await isolatedProcess.stop().catch(() => {})
      throw error
    }
  }

  describe('memory', () => {
    beforeEach(() => isolatedProcess.start(), isolatedProcessSetupTimeout)
    afterEach(() => isolatedProcess.stop())

    for (const [workloadIndex, name] of options.names.entries()) {
      bench(name, () => run(workloadIndex), {
        ...memoryBenchOptions,
        setup: () => isolatedProcess.start(),
        teardown: () => isolatedProcess.stop(),
      })
    }
  })
}
