import {
  createInterruptedNavigationRuntime,
  runInterruptedNavigationComputation,
} from '../../shared.ts'
import type { InterruptedLoaderPayload } from '../../shared.ts'

export const interruptedNavigationRuntime = createInterruptedNavigationRuntime()

export function recordInterruptedCommit(payload: InterruptedLoaderPayload) {
  interruptedNavigationRuntime.recordCommit(payload)
  void runInterruptedNavigationComputation(payload.checksum)
}
