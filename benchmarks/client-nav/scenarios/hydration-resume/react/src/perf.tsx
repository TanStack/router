import {
  createDeferredResolvedMarkerAttributes,
  hydrationResumeSubscriberSlots,
  runHydrationResumeComputation,
  type HydrationResumeDeferredPayload,
} from '../../shared.ts'

export const subscriberSlots = hydrationResumeSubscriberSlots

export function PerfSubscriber({ seed }: { seed: number }) {
  void runHydrationResumeComputation(seed)
  return null
}

export function DeferredResolved({
  payload,
  source,
}: {
  payload: HydrationResumeDeferredPayload
  source: string
}) {
  void runHydrationResumeComputation(payload.checksum)

  return <div {...createDeferredResolvedMarkerAttributes(payload, source)} />
}
