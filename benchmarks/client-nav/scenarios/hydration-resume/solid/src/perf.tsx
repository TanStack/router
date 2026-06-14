import { createRenderEffect } from 'solid-js'
import {
  createDeferredResolvedMarkerAttributes,
  hydrationResumeSubscriberSlots,
  runHydrationResumeComputation,
  type HydrationResumeDeferredPayload,
} from '../../shared.ts'

export const subscriberSlots = hydrationResumeSubscriberSlots

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
      {...createDeferredResolvedMarkerAttributes(props.payload, props.source)}
    />
  )
}
