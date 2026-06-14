import { createRenderEffect } from 'solid-js'
import {
  runHydrationResumeComputation,
  type HydrationResumeDeferredPayload,
} from '../../shared.ts'

export const subscriberSlots = Array.from({ length: 4 }, (_, index) => index)

export function PerfSubscriber(props: { seed: number }) {
  createRenderEffect(() => {
    void runHydrationResumeComputation(props.seed)
  })

  return null
}

export function DeferredResolved(props: {
  payload: HydrationResumeDeferredPayload
  source: string
}) {
  createRenderEffect(() => {
    void runHydrationResumeComputation(props.payload.checksum)
  })

  return (
    <div
      data-hydration-resume-marker="deferred-resolved"
      data-item-id={props.payload.itemId}
      data-source={props.source}
      data-value={props.payload.value}
    />
  )
}
