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

    if (!(value.$__apollo_queryRef.stream instanceof ReadableStream)) {
      const intermediateStream = new TransformStream()
      Object.defineProperty(value.$__apollo_queryRef, 'stream', {
        get: () => intermediateStream.readable,
        set: (value: ReadableStream) => {
          console.log('setting stream, starts piping!')
          value.pipeTo(intermediateStream.writable)
        },
      })
    }

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
