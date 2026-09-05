import { afterEach, beforeEach, bench } from 'vitest'
import { memoryBenchOptions } from '../bench-utils'

let retained: unknown
let baseline: NodeJS.MemoryUsage
let label: string

beforeEach(() => {
  retained = undefined
  global.gc?.()
  baseline = process.memoryUsage()
})

afterEach(() => {
  global.gc?.()
  const usage = process.memoryUsage()
  console.log(
    'MEMORY_CONTROL',
    JSON.stringify({
      label,
      heapUsed: usage.heapUsed - baseline.heapUsed,
      external: usage.external - baseline.external,
      retained: retained !== undefined,
    }),
  )
})

for (const mib of [1, 2]) {
  bench(
    `diagnostic retained JS array ${mib} MiB`,
    () => {
      label = `JS ${mib} MiB`
      retained = new Array((mib * 1024 * 1024) / 8).fill(1)
    },
    memoryBenchOptions,
  )
  bench(
    `diagnostic retained Buffer ${mib} MiB`,
    () => {
      label = `Buffer ${mib} MiB`
      retained = Buffer.alloc(mib * 1024 * 1024, 1)
    },
    memoryBenchOptions,
  )
}
