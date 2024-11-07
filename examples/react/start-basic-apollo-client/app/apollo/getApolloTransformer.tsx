import {
  isTransportedQueryRef,
  reviveTransportedQueryRef,
} from './createQueryPreloader'
import type { ApolloClient } from './ApolloClient'
import type { InternalTransportedQueryRef } from './createQueryPreloader'

interface Transformer<T> {
  stringifyCondition: (value: any) => boolean
  stringify: (value: T) => object | string
  parseCondition: (value: any) => boolean
  parse: (value: any) => T
}

export const getApolloTransformer = (
  apolloClient: ApolloClient,
): Transformer<InternalTransportedQueryRef<unknown, unknown>> => ({
  stringifyCondition: () => false,
  stringify: () => {
    throw new Error()
  },
  parseCondition: isTransportedQueryRef,
  parse: (value: InternalTransportedQueryRef<unknown, unknown>) => {
    // Due to the timing in `afterHydrate`, the stream at this point will still be an empty object
    // to be replaced by the `extracted` stream value a moment later
    // Nonetheless, we want to kick off hydration of the queryRef here already,
    // so query deduplication kicks in.
    // So we create an intermediate `TransformStream` that is exposed via a getter,
    // while at the same time, a setter is put into place that will start piping the
    // incoming stream into our intermediate stream as soon as it is set.
    // The check for `instanceof ReadableStream` is here just in case that the timing changes
    // in the future and we don't need to do this anymore.
    if (!(value.$__apollo_queryRef.stream instanceof ReadableStream)) {
      const intermediateStream = new TransformStream()
      Object.defineProperty(value.$__apollo_queryRef, 'stream', {
        get: () => intermediateStream.readable,
        set: (value: ReadableStream) => {
          value.pipeTo(intermediateStream.writable)
        },
      })
    }

    // with the guarantee to have a stream, we can now kick off the hydration
    value._hydrated = reviveTransportedQueryRef(value, apolloClient)
    return value
  },
})
