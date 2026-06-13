import { profileFlameWorkload } from '../flame-control.ts'
import type { ServerMemoryBenchmark } from './benchmark.ts'

export async function runServerFlameBenchmark(
  setup: () => Promise<ServerMemoryBenchmark>,
) {
  const test = await setup()

  await test.sanity()
  await profileFlameWorkload(test.run)
}
