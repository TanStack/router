import { profileFlameWorkload } from '../flame-control.ts'
import { window } from './jsdom.ts'
import { warmClientMemoryWorkload } from './benchmark.ts'
import type { ClientMemoryWorkload } from './benchmark.ts'

export async function runClientFlameBenchmark(workload: ClientMemoryWorkload) {
  try {
    await workload.sanity()
    await warmClientMemoryWorkload(workload)
    await workload.before?.()
    await profileFlameWorkload(workload.run, workload.name)
  } finally {
    await workload.after?.()
    window.close()
  }
}
