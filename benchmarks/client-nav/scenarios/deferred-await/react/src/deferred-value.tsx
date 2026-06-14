import { Await } from '@tanstack/react-router'
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
    <Await
      promise={props.promise}
      fallback={
        <span data-deferred-marker={deferredFallbackMarker(props.markerKey)}>
          Loading {props.markerKey}
        </span>
      }
    >
      {(payload) => (
        <span
          data-deferred-marker={deferredResolvedMarker(props.markerKey)}
          data-deferred-checksum={payload.checksum}
        >
          {payload.label}
        </span>
      )}
    </Await>
  )
}
