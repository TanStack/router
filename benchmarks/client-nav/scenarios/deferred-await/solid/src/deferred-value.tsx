import { Show, createSignal } from 'solid-js'
import {
  deferredFallbackMarker,
  deferredResolvedMarker,
  type DeferredPayload,
} from '../../shared'

export function DeferredValue(props: {
  markerKey: string
  promise: Promise<DeferredPayload>
}) {
  const [payload, setPayload] = createSignal<DeferredPayload>()

  void props.promise.then((value) => {
    setPayload(value)
  })

  return (
    <Show
      when={payload()}
      fallback={
        <span data-deferred-marker={deferredFallbackMarker(props.markerKey)}>
          Loading {props.markerKey}
        </span>
      }
    >
      {(resolvedPayload) => {
        const value = resolvedPayload()

        return (
          <span
            data-deferred-marker={deferredResolvedMarker(props.markerKey)}
            data-deferred-checksum={value.checksum}
          >
            {value.label}
          </span>
        )
      }}
    </Show>
  )
}
