import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  hashKey,
  hydrate,
} from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import type {
  QueryObserverResult,
  UseQueryOptions,
} from '@tanstack/react-query'

// NOTE: Most of the integration code found here is experimental and will
// definitely end up in a more streamlined API in the future. This is just
// to show what's possible with the current APIs.

export function createRouter() {
  const seenQueryKeys = new Set<string>()

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        _experimental_beforeQuery: (options: UseQueryOptions) => {
          // On the server, check if we've already seen the query before
          if (router.isServer) {
            if (seenQueryKeys.has(hashKey(options.queryKey))) {
              return
            }

            seenQueryKeys.add(hashKey(options.queryKey))

            // If we haven't seen the query and we have data for it,
            // That means it's going to get dehydrated with critical
            // data, so we can skip the injection
            if (queryClient.getQueryData(options.queryKey) !== undefined) {
              ;(options as any).__skipInjection = true
              return
            }
          } else {
            // On the client, pick up the deferred data from the stream
            const dehydratedClient = router.getStreamedValue<any>(
              '__QueryClient__' + hashKey(options.queryKey),
            )

            // If we have data, hydrate it into the query client
            if (dehydratedClient && !dehydratedClient.hydrated) {
              dehydratedClient.hydrated = true
              hydrate(queryClient, dehydratedClient)
            }
          }
        },
        _experimental_afterQuery: (
          options: UseQueryOptions,
          _result: QueryObserverResult,
        ) => {
          // On the server (if we're not skipping injection)
          // send down the dehydrated query
          if (
            router.isServer &&
            !(options as any).__skipInjection &&
            queryClient.getQueryData(options.queryKey) !== undefined
          ) {
            router.streamValue(
              '__QueryClient__' + hashKey(options.queryKey),
              dehydrate(queryClient, {
                shouldDehydrateMutation: () => false,
                shouldDehydrateQuery: (query) =>
                  hashKey(query.queryKey) === hashKey(options.queryKey),
              }),
            )
          }
        },
      } as any,
    },
  })

  const router = createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    dehydrate: () => ({
      // When critical data is dehydrated, we also dehydrate the query client
      dehydratedQueryClient: dehydrate(queryClient),
    }),
    hydrate: ({ dehydratedQueryClient }) => {
      // On the client, hydrate the query client with the dehydrated data
      hydrate(queryClient, dehydratedQueryClient)
    },
    context: {
      // Pass the query client to the context, so we can access it in loaders
      queryClient,
    },
    // Wrap the app in a QueryClientProvider
    Wrap: ({ children }) => {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )
    },
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
