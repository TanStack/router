import { createRouter, isRedirect } from '@tanstack/solid-router'
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import type { AnyRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

export function getRouter() {
  const queryClient = new QueryClient()
  const router = createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
    context: {
      foo: {
        bar: 'baz',
      },
    },
    // No integration package: on Solid, SSR transfer is native to
    // QueryClientProvider (it serializes the request's cache into Solid's
    // hydration registry and primes the client cache from it).
    Wrap: (props) => (
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    ),
  })

  routeCacheRedirects(router, queryClient)

  return router
}

// Redirects thrown where the router is driving — beforeLoad, loaders, and
// any queryFn a loader awaits — are the router's own to handle. Cache-driven
// fetches (mount fetches, background refetches, mutations) run outside it,
// so redirect() errors from both caches hand off to the router here.
// Client-only runtime navigation glue, not an SSR concern: on the server a
// redirect thrown during render resolves through the stream handler.
function routeCacheRedirects(router: AnyRouter, queryClient: QueryClient) {
  if (typeof document === 'undefined') return
  const navigateOnRedirect = <TRest extends Array<unknown>>(
    onError?: (error: Error, ...rest: TRest) => void,
  ) => {
    return (error: Error, ...rest: TRest) => {
      if (isRedirect(error)) {
        error.options._fromLocation = router.stores.location.get()
        void router.navigate(router.resolveRedirect(error).options)
        return
      }
      onError?.(error, ...rest)
    }
  }
  const queryCache = queryClient.getQueryCache()
  const mutationCache = queryClient.getMutationCache()
  queryCache.config.onError = navigateOnRedirect(queryCache.config.onError)
  mutationCache.config.onError = navigateOnRedirect(
    mutationCache.config.onError,
  )
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
