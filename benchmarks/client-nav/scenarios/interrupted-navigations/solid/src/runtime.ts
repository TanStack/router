import { createRenderEffect } from 'solid-js'
import {
  createInterruptedNavigationRuntime,
  runInterruptedNavigationComputation,
} from '../../shared.ts'
import type { InterruptedLoaderPayload } from '../../shared.ts'

export const interruptedNavigationRuntime = createInterruptedNavigationRuntime()

export function CommitEffect(props: { payload: InterruptedLoaderPayload }) {
  createRenderEffect(() => {
    interruptedNavigationRuntime.recordCommit(props.payload)
    void runInterruptedNavigationComputation(props.payload.checksum)
  })

  return null
}
