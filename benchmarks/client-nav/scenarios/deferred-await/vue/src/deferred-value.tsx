import * as Vue from 'vue'
import { Await } from '@tanstack/vue-router'
import {
  deferredFallbackMarker,
  deferredResolvedMarker,
  type DeferredPayload,
} from '../../shared'

export function createDeferredValueNode(
  markerKey: string,
  promise: Promise<DeferredPayload>,
) {
  return (
    <Vue.Suspense>
      {{
        default: () => (
          <Await
            promise={promise}
            children={(payload: DeferredPayload) => (
              <span
                data-deferred-marker={deferredResolvedMarker(markerKey)}
                data-deferred-checksum={payload.checksum}
              >
                {payload.label}
              </span>
            )}
          />
        ),
        fallback: () => (
          <span data-deferred-marker={deferredFallbackMarker(markerKey)}>
            Loading {markerKey}
          </span>
        ),
      }}
    </Vue.Suspense>
  )
}
