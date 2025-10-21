import { QueryClient } from '@tanstack/solid-query'
import { createRouter } from '@tanstack/solid-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/solid-router-ssr-query'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Enable only on client to avoid hydration mismatches
        experimental_prefetchInRender: typeof window !== 'undefined',
      },
    },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
  })
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  })
  return router
}
