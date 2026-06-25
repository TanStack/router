import { createRenderEffect } from 'solid-js'
import {
  createInterruptedNavigationRuntime,
  recordInterruptedNavigationCommit,
} from '../../shared.ts'
import type { InterruptedLoaderPayload } from '../../shared.ts'

export const interruptedNavigationRuntime = createInterruptedNavigationRuntime()

export function CommitEffect(props: { payload: InterruptedLoaderPayload }) {
  createRenderEffect(() => {
    recordInterruptedNavigationCommit(
      interruptedNavigationRuntime,
      props.payload,
    )
  })

  return null
}
