import { profileFlameWorkload } from '../flame-control.ts'
import type { ServerMemoryWorkloadGroup } from './benchmark.ts'

export async function runServerFlameBenchmark(
  workloadGroup: ServerMemoryWorkloadGroup,
) {
  await workloadGroup.sanity()
  await workloadGroup.warmup?.()

  for (const workload of workloadGroup.workloads) {
    await profileFlameWorkload(workload.run, workload.name)
  }
}
