import { createSerializationAdapter } from '@tanstack/react-router'
// RSC HMR setup (dev-only, provided by the active Start bundler adapter).
import { setupRscHmr } from 'virtual:tanstack-rsc-hmr'
import {
  createCompositeFromStream,
  createRenderableFromStream,
} from './createServerComponentFromStream'
import type {
  AnyCompositeComponent,
  RscSlotUsageEvent,
} from './ServerComponentTypes'

if (process.env.NODE_ENV === 'development') {
  setupRscHmr()
}

/**
 * Client-side serialization adapter for RSC (renderable + composite).
 */
type SerializedRsc = {
  kind: 'renderable' | 'composite'
  stream: ReadableStream<Uint8Array>
  slotUsagesStream?: ReadableStream<RscSlotUsageEvent>
}

const adapter = createSerializationAdapter({
  key: '$RSC',
  test: (_value: unknown): _value is never => false,
  toSerializable: (): never => {
    throw new Error('RSC cannot be serialized on client')
  },
  fromSerializable: (value: SerializedRsc): AnyCompositeComponent => {
    if (value.kind === 'renderable') {
      return createRenderableFromStream(value.stream)
    }

    return createCompositeFromStream(value.stream, {
      slotUsagesStream: value.slotUsagesStream,
    })
  },
})

export const rscSerializationAdapter = () => [adapter]
