import { afterEach, beforeEach, bench, describe } from 'vitest'
import { IsolatedMemoryProcess } from '../shared/isolated-process.ts'
import { memoryBenchOptions } from './bench-utils.ts'
import type { IsolatedMemoryBenchmarkKind } from '../shared/isolated-process.ts'

type RegisterIsolatedClientMemoryBenchmarkOptions = {
  name: string
  setupUrl: URL
}

const kind = 'client' satisfies IsolatedMemoryBenchmarkKind

export function registerIsolatedClientMemoryBenchmark(
  options: RegisterIsolatedClientMemoryBenchmarkOptions,
) {
  const isolatedProcess = new IsolatedMemoryProcess({
    kind,
    setupUrl: options.setupUrl,
    workloadNames: [options.name],
  })

  const run = async () => {
    try {
      await isolatedProcess.run(0)
    } catch (error) {
      await isolatedProcess.stop().catch(() => {})
      throw error
    }
  }

  describe('memory', () => {
    beforeEach(() => isolatedProcess.start())
    afterEach(() => isolatedProcess.stop())

    bench(options.name, run, {
      ...memoryBenchOptions,
      setup: () => isolatedProcess.start(),
      teardown: () => isolatedProcess.stop(),
    })
  })
}
