import {
  QueryClientProvider,
  dehydrate,
  hashKey,
  hydrate,
} from '@tanstack/react-query'
import { type AnyRouterWithContext } from '@tanstack/react-router'
import { Fragment } from 'react'
import type {
  QueryClient,
  QueryObserverResult,
  UseQueryOptions,
} from '@tanstack/react-query'

export function routerWithQueryClient<
  T extends AnyRouterWithContext<{
    queryClient: QueryClient
  }>,
>(router: T, queryClient: QueryClient): T {
  const seenQueryKeys = new Set<string>()

  const ogClientOptions = queryClient.getDefaultOptions()

  queryClient.setDefaultOptions({
    ...ogClientOptions,
    queries: {
      ...ogClientOptions.queries,
      _experimental_beforeQuery: (options: UseQueryOptions) => {
        // Call the original beforeQuery
        ;(ogClientOptions.queries as any)?._experimental_beforeQuery?.(options)

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
        // Call the original afterQuery
        ;(ogClientOptions.queries as any)?._experimental_afterQuery?.(
          options,
          _result,
        )

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
  })

  const ogOptions = router.options
  router.options = {
    ...router.options,
    dehydrate: () => {
      return {
        ...ogOptions.dehydrate?.(),
        // When critical data is dehydrated, we also dehydrate the query client
        dehydratedQueryClient: dehydrate(queryClient),
      }
    },
    hydrate: (dehydrated: any) => {
      ogOptions.hydrate?.(dehydrated)
      // On the client, hydrate the query client with the dehydrated data
      hydrate(queryClient, dehydrated.dehydratedQueryClient)
    },
    context: {
      ...ogOptions.context,
      // Pass the query client to the context, so we can access it in loaders
      queryClient,
    },
    // Wrap the app in a QueryClientProvider
    Wrap: ({ children }) => {
      const OGWrap = ogOptions.Wrap || Fragment
      return (
        <QueryClientProvider client={queryClient}>
          <OGWrap>{children}</OGWrap>
        </QueryClientProvider>
      )
    },
  }

  return router
}
