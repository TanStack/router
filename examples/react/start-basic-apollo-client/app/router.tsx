import {
  createRouter as createTanStackRouter,
  defaultTransformer,
} from '@tanstack/react-router'
import { InMemoryCache } from '@apollo/client-react-streaming'
import { createQueryPreloader } from '@apollo/client/react/index.js'
import { gql } from '@apollo/client/index.js'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import { ApolloClient } from './apollo/ApolloClient'
import type { PreloadedQueryRef } from '@apollo/client/react/internal/index.js'
import type { Transformer } from 'node_modules/@tanstack/react-router/dist/esm/transformer'

const encodeStream = new TransformStream({
  transform(chunk, controller) {
    controller.enqueue(JSON.stringify(chunk))
  },
})

const decodeStream = new TransformStream({
  transform(chunk, controller) {
    controller.enqueue(JSON.parse(chunk))
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
      {
        stringifyCondition(value) {
          return (
            value != null &&
            value instanceof ReadableStream &&
            (value as any).JSONStream
          )
        },
        stringify(value) {
          return { $__JSONStream: value.pipeThrough(encodeStream) }
        },
        parseCondition(value) {
          return (
            value != null &&
            value.$__JSONStream &&
            value.$__JSONStream instanceof ReadableStream
          )
        },
        parse(value) {
          console.log('parsing stream')
          return (value.$__JSONStream as ReadableStream).pipeThrough(
            decodeStream,
          )
        },
      } satisfies Transformer<ReadableStream<any> & { JSONStream?: boolean }>,
      {
        stringifyCondition: () => false,
        stringify: () => {
          throw new Error()
        },
        parseCondition: (value: any) =>
          value != null && !!value.__apollo_queryRef,
        parse: ({ __apollo_queryRef: [query, options] }) => {
          console.log('parsing queryRef')
          return queryPreloader(gql(query), options)
        },
      } satisfies Transformer<PreloadedQueryRef>,
    ]),
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
