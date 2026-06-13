import { profileFlameWorkload } from '../flame-control.ts'
import { window } from './jsdom.ts'
import type { ClientMemoryBenchmark } from './benchmark.ts'

export async function runClientFlameBenchmark(
  setup: () => ClientMemoryBenchmark,
) {
  const test = setup()

  try {
    await setup().sanity()
    await test.before?.()
    await profileFlameWorkload(test.run)
  } finally {
    await test.after?.()
    window.close()
  }
}
