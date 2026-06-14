import {
  runHydrationResumeComputation,
  type HydrationResumeDeferredPayload,
} from '../../shared.ts'

export const subscriberSlots = Array.from({ length: 4 }, (_, index) => index)

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

  return (
    <div
      data-hydration-resume-marker="deferred-resolved"
      data-item-id={payload.itemId}
      data-source={source}
      data-value={payload.value}
    />
  )
}
