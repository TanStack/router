import { Suspense } from 'solid-js'
import { Await } from '@tanstack/solid-router'
import {
  deferredFallbackMarker,
  deferredResolvedMarker,
  type DeferredPayload,
} from '../../shared'

export function DeferredValue(props: {
  markerKey: string
  promise: Promise<DeferredPayload>
}) {
  return (
    <Suspense
      fallback={
        <span data-deferred-marker={deferredFallbackMarker(props.markerKey)}>
          Loading {props.markerKey}
        </span>
      }
    >
      <Await promise={props.promise}>
        {(payload) => (
          <span
            data-deferred-marker={deferredResolvedMarker(props.markerKey)}
            data-deferred-checksum={payload.checksum}
          >
            {payload.label}
          </span>
        )}
      </Await>
    </Suspense>
  )
}
