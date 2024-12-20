import { defaultTransformer } from '@tanstack/react-router'
import {
  isTransportedQueryRef,
  reviveTransportedQueryRef,
} from '@apollo/client-react-streaming'
import { createTransportedQueryPreloader } from './createQueryPreloader'
import { ApolloProvider } from './ApolloProvider'
import type { PreloadQueryFunction } from '@apollo/client'
import type { AnyRouter } from '@tanstack/react-router'
import type { ApolloClient } from './ApolloClient'

export function routerWithApolloClient<TRouter extends AnyRouter>(
  router: TRouter['options']['context'] extends {
    apolloClient: ApolloClient
    preloadQuery: PreloadQueryFunction
  }
    ? TRouter
    : never,
  apolloClient: ApolloClient,
): TRouter {
  // @ts-ignore unavoidable due to the ternary in arguments
  router.options.context.apolloClient = apolloClient

  // it would be nice to do this in the long run
  // @ts-ignore unavoidable due to the ternary in arguments
  //   router.options.context.preloadQuery = router.isServer
  //     ? createTransportedQueryPreloader(apolloClient)
  //     : createQueryPreloader(apolloClient)

  // @ts-ignore unavoidable due to the ternary in arguments
  router.options.context.preloadQuery =
    createTransportedQueryPreloader(apolloClient)

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const previousTransformer = router.options.transformer || defaultTransformer

  router.options.transformer = {
    stringify(value) {
      return previousTransformer.stringify(value)
    },
    parse(str) {
      const transformed = previousTransformer.parse(str)

      JSON.stringify(transformed, (_, value) => {
        if (isTransportedQueryRef(value)) {
          // Due to the timing in `afterHydrate`, the stream at this point will still be an empty object
          // to be replaced by the `extracted` stream value a moment later
          // Nonetheless, we want to kick off hydration of the queryRef here already,
          // so query deduplication kicks in.
          // So we create an intermediate `TransformStream` that is exposed via a getter,
          // while at the same time, a setter is put into place that will start piping the
          // incoming stream into our intermediate stream as soon as it is set.
          // The check for `instanceof ReadableStream` is here just in case that the timing changes
          // in the future and we don't need to do this anymore.
          const intermediateStream = new TransformStream()
          Object.defineProperty(value.$__apollo_queryRef, 'stream', {
            get: () => intermediateStream.readable,
            set: (value: ReadableStream) => {
              value.pipeTo(intermediateStream.writable)
            },
          })
          reviveTransportedQueryRef(value, apolloClient)
        }
      })

      return transformed
    },
  }

  router.options.InnerWrap = ApolloProvider

  return router
}
