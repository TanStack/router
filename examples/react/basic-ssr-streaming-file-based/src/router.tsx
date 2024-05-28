import { createRouter as createReactRouter } from '@tanstack/react-router'

import SuperJSON from 'superjson'
import { createQueryPreloader } from '@apollo/client'
import { routeTree } from './routeTree.gen'
import type { ApolloClient } from '@apollo/client'

export function createRouter(apolloClient: ApolloClient<any>) {
  return createReactRouter({
    routeTree,
    context: {
      head: '',
      preloadQuery: createQueryPreloader(apolloClient),
      apolloClient,
    },
    defaultPreload: 'intent',
    // Maybe this is already possible if we provided some kind of
    // `transformer: apolloTransformer(client)`
    // here.
    // Can a transformer return Promises?
    // Maybe even streams or async iterables?
    transformer: SuperJSON,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
