import {
  dehydrate as queryDehydrate,
  hydrate as queryHydrate,
} from '@tanstack/query-core'
import { isRedirect } from '@tanstack/router-core'
import type { AnyRouter } from '@tanstack/router-core'
import type {
  QueryClient,
  DehydratedState as QueryDehydratedState,
} from '@tanstack/query-core'

export type RouterSsrQueryOptions<TRouter extends AnyRouter> = {
  router: TRouter
  queryClient: QueryClient

  /**
   * If `true`, the QueryClient will handle errors thrown by `redirect()` inside of mutations and queries.
   *
   * @default true
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/api/router/redirectFunction)
   */
  handleRedirects?: boolean
}

type DehydratedRouterQueryState = {
  dehydratedQueryClient?: QueryDehydratedState
  queryStream: ReadableStream<QueryDehydratedState>
}

export function setupCoreRouterSsrQueryIntegration<TRouter extends AnyRouter>({
  router,
  queryClient,
  handleRedirects = true,
}: RouterSsrQueryOptions<TRouter>) {
  const ogHydrate = router.options.hydrate
  const ogDehydrate = router.options.dehydrate

  if (router.isServer) {
    const sentQueries = new Set<string>()
    const queryStream = createPushableStream()
    let unsubscribe: (() => void) | undefined = undefined
    router.options.dehydrate =
      async (): Promise<DehydratedRouterQueryState> => {
        router.serverSsr!.onRenderFinished(() => {
          queryStream.close()
          unsubscribe?.()
          unsubscribe = undefined
        })
        const ogDehydrated = await ogDehydrate?.()

        const dehydratedRouter = {
          ...ogDehydrated,
          // prepare the stream for queries coming up during rendering
          queryStream: queryStream.stream,
        }

        const dehydratedQueryClient = queryDehydrate(queryClient)
        if (dehydratedQueryClient.queries.length > 0) {
          dehydratedQueryClient.queries.forEach((query) => {
            sentQueries.add(query.queryHash)
          })
          dehydratedRouter.dehydratedQueryClient = dehydratedQueryClient
        }

        return dehydratedRouter
      }

    const ogClientOptions = queryClient.getDefaultOptions()
    queryClient.setDefaultOptions({
      ...ogClientOptions,
      dehydrate: {
        shouldDehydrateQuery: () => true,
        ...ogClientOptions.dehydrate,
      },
    })

    unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      // before rendering starts, we do not stream individual queries
      // instead we dehydrate the entire query client in router's dehydrate()
      // if attachRouterServerSsrUtils() has not been called yet, `router.serverSsr` will be undefined and we also do not stream
      if (!router.serverSsr?.isDehydrated()) {
        return
      }
      if (sentQueries.has(event.query.queryHash)) {
        return
      }
      // promise not yet set on the query, so we cannot stream it yet
      if (!event.query.promise) {
        return
      }
      if (queryStream.isClosed()) {
        console.warn(
          `tried to stream query ${event.query.queryHash} after stream was already closed`,
        )
        return
      }
      sentQueries.add(event.query.queryHash)
      queryStream.enqueue(
        queryDehydrate(queryClient, {
          shouldDehydrateQuery: (query) => {
            if (query.queryHash === event.query.queryHash) {
              return (
                ogClientOptions.dehydrate?.shouldDehydrateQuery?.(query) ?? true
              )
            }
            return false
          },
        }),
      )
    })
    // on the client
  } else {
    router.options.hydrate = async (dehydrated: DehydratedRouterQueryState) => {
      await ogHydrate?.(dehydrated)
      // hydrate the query client with the dehydrated data (if it was dehydrated on the server)
      if (dehydrated.dehydratedQueryClient) {
        queryHydrate(queryClient, dehydrated.dehydratedQueryClient)
      }

      // read the query stream and hydrate the queries as they come in
      const reader = dehydrated.queryStream.getReader()
      reader
        .read()
        .then(async function handle({ done, value }) {
          queryHydrate(queryClient, value)
          if (done) {
            return
          }
          const result = await reader.read()
          return handle(result)
        })
        .catch((err) => {
          console.error('Error reading query stream:', err)
        })
    }
    if (handleRedirects) {
      const ogMutationCacheConfig = queryClient.getMutationCache().config
      queryClient.getMutationCache().config = {
        ...ogMutationCacheConfig,
        onError: (error, ...rest) => {
          if (isRedirect(error)) {
            error.options._fromLocation = router.state.location
            return router.navigate(router.resolveRedirect(error).options)
          }

          return ogMutationCacheConfig.onError?.(error, ...rest)
        },
      }

      const ogQueryCacheConfig = queryClient.getQueryCache().config
      queryClient.getQueryCache().config = {
        ...ogQueryCacheConfig,
        onError: (error, ...rest) => {
          if (isRedirect(error)) {
            error.options._fromLocation = router.state.location
            return router.navigate(router.resolveRedirect(error).options)
          }

          return ogQueryCacheConfig.onError?.(error, ...rest)
        },
      }
    }
  }
}

type PushableStream = {
  stream: ReadableStream
  enqueue: (chunk: unknown) => void
  close: () => void
  isClosed: () => boolean
  error: (err: unknown) => void
}

function createPushableStream(): PushableStream {
  let controllerRef: ReadableStreamDefaultController
  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller
    },
  })
  let _isClosed = false

  return {
    stream,
    enqueue: (chunk) => controllerRef.enqueue(chunk),
    close: () => {
      controllerRef.close()
      _isClosed = true
    },
    isClosed: () => _isClosed,
    error: (err: unknown) => controllerRef.error(err),
  }
}
