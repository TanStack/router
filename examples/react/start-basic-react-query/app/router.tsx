import { QueryClient } from '@tanstack/react-query'
import { ConvexQueryClient, convexQueryKeyHashFn } from 'convex-tanstack-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routerWithQueryClient } from '@tanstack/react-router-with-query'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

// NOTE: Most of the integration code found here is experimental and will
// definitely end up in a more streamlined API in the future. This is just
// to show what's possible with the current APIs.

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL!

if (!CONVEX_URL) {
  throw new Error('missing envar')
}

export function createRouter() {
  const convexQueryClient = new ConvexQueryClient(CONVEX_URL)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryKeyHashFn,
        queryFn: convexQueryClient.queryFn,
      },
    },
  })
  convexQueryClient.connect(queryClient)

  return routerWithQueryClient(
    createTanStackRouter({
      routeTree,
      defaultPreload: 'intent',
      defaultErrorComponent: DefaultCatchBoundary,
      defaultNotFoundComponent: () => <NotFound />,
    }),
    queryClient,
  )
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
