import {
  createRouter as createTanStackRouter,
  defaultTransformer,
} from '@tanstack/react-router'
import { InMemoryCache } from '@apollo/client-react-streaming'
import { createQueryPreloader } from '@apollo/client/react/index.js'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import { ApolloClient, isTransportedQueryRef } from './apollo/ApolloClient'
import type { Transformer } from 'node_modules/@tanstack/react-router/dist/esm/transformer'
import type { InternalTransportedQueryRef } from './apollo/ApolloClient'
import type { PreloadQueryFunction } from '@apollo/client/index.js'

const getApolloTransformer = (
  queryPreloader: PreloadQueryFunction,
): Transformer<InternalTransportedQueryRef<unknown, unknown>> => ({
  stringifyCondition: () => false,
  stringify: () => {
    throw new Error()
  },
  parseCondition: isTransportedQueryRef,
  parse: (value: InternalTransportedQueryRef<unknown, unknown>) => {
    console.log('parsing', value)

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
    value._hydrated = queryPreloader.revive(value)
    return value
  },
})

export function createRouter() {
  const apolloClient = new ApolloClient({
    cache: new InMemoryCache(),
    uri: 'https://graphqlzero.almansi.me/api',
  })
  const queryPreloader = createQueryPreloader(apolloClient)
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    context: {
      apolloClient,
      queryPreloader,
    },
    transformer: defaultTransformer.withTransformers([
      getApolloTransformer(queryPreloader),
    ]),
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
