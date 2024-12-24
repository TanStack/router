import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { InMemoryCache } from '@apollo/client-react-streaming'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import { ApolloClient } from './apollo/ApolloClient'
import { routerWithApolloClient } from './apollo'

export function createRouter() {
  const apolloClient = new ApolloClient({
    cache: new InMemoryCache(),
    uri: 'https://graphqlzero.almansi.me/api',
  })
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    // will be filled by `routerWithApolloClient`
    context: {} as any,
  })

  return routerWithApolloClient(router, apolloClient)
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
