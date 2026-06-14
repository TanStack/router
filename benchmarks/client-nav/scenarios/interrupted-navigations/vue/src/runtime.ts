import {
  createInterruptedNavigationRuntime,
  recordInterruptedNavigationCommit,
} from '../../shared.ts'
import type { InterruptedLoaderPayload } from '../../shared.ts'

export const interruptedNavigationRuntime = createInterruptedNavigationRuntime()

export function recordInterruptedCommit(payload: InterruptedLoaderPayload) {
  recordInterruptedNavigationCommit(interruptedNavigationRuntime, payload)
}
