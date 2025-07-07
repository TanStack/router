import { Fragment } from 'react'
import {
  QueryClientProvider,
  dehydrate as queryDehydrate,
  hydrate as queryHydrate,
} from '@tanstack/react-query'
import { isRedirect } from '@tanstack/router-core'
import '@tanstack/router-core/ssr/client'
import type { AnyRouter } from '@tanstack/react-router'
import type {
  QueryClient,
  DehydratedState as QueryDehydratedState,
} from '@tanstack/react-query'

type AdditionalOptions = {
  WrapProvider?: (props: { children: any }) => React.JSX.Element
  /**
   * If `true`, the QueryClient will handle errors thrown by `redirect()` inside of mutations and queries.
   *
   * @default true
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/api/router/redirectFunction)
   */
  handleRedirects?: boolean
}

type DehydratedRouterQueryState = {
  dehydratedQueryClient: QueryDehydratedState
  queryStream: ReadableStream<QueryDehydratedState>
}
export type ValidateRouter<TRouter extends AnyRouter> =
  NonNullable<TRouter['options']['context']> extends {
    queryClient: QueryClient
  }
    ? TRouter
    : never

export function routerWithQueryClient<TRouter extends AnyRouter>(
  router: ValidateRouter<TRouter>,
  queryClient: QueryClient,
  additionalOpts?: AdditionalOptions,
): TRouter {
  let queryStream: PushableStream

  if (router.isServer) {
    queryStream = createPushableStream()
  }

  const ogClientOptions = queryClient.getDefaultOptions()
  queryClient.setDefaultOptions({
    ...ogClientOptions,
    dehydrate: {
      shouldDehydrateQuery: () => true,
      ...ogClientOptions.dehydrate,
    },
  })

  if (additionalOpts?.handleRedirects ?? true) {
    const ogMutationCacheConfig = queryClient.getMutationCache().config
    queryClient.getMutationCache().config = {
      ...ogMutationCacheConfig,
      onError: (error, _variables, _context, _mutation) => {
        if (isRedirect(error)) {
          error.options._fromLocation = router.state.location
          return router.navigate(router.resolveRedirect(error).options)
        }

        return ogMutationCacheConfig.onError?.(
          error,
          _variables,
          _context,
          _mutation,
        )
      },
    }

    const ogQueryCacheConfig = queryClient.getQueryCache().config
    queryClient.getQueryCache().config = {
      ...ogQueryCacheConfig,
      onError: (error, _query) => {
        if (isRedirect(error)) {
          error.options._fromLocation = router.state.location
          return router.navigate(router.resolveRedirect(error).options)
        }

        return ogQueryCacheConfig.onError?.(error, _query)
      },
    }
    if (router.isServer) {
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type === 'added') {
          if (!router.serverSsr!.isDehydrated()) {
            return
          }
          if (queryStream!.isClosed) {
            console.warn(
              `tried to stream query ${event.query.queryHash} after stream was already closed`,
            )
          }
          queryStream!.enqueue(
            queryDehydrate(queryClient, {
              shouldDehydrateQuery: (query) => {
                if (query.queryHash === event.query.queryHash) {
                  return (
                    ogClientOptions.dehydrate?.shouldDehydrateQuery?.(query) ??
                    true
                  )
                }
                return false
              },
            }),
          )
        }
      })
    }
  }

  const ogOptions = router.options
  router.options = {
    ...router.options,
    dehydrate: async (): Promise<DehydratedRouterQueryState> => {
      router.serverSsr!.onRenderFinished(() => queryStream.close())
      const ogDehydrated = await ogOptions.dehydrate?.()
      return {
        ...ogDehydrated,
        // When critical data is dehydrated, we also dehydrate the query client
        dehydratedQueryClient: queryDehydrate(queryClient),
        // prepare the stream for queries coming up during rendering
        queryStream: queryStream.stream,
      }
    },
    hydrate: async (dehydrated: DehydratedRouterQueryState) => {
      console.log('dehydrated', dehydrated)
      await ogOptions.hydrate?.(dehydrated)
      // On the client, hydrate the query client with the dehydrated data
      queryHydrate(queryClient, dehydrated.dehydratedQueryClient)
      const reader = dehydrated.queryStream.getReader()
      reader.read().then(function handle({ done, value }): Promise<void> {
        queryHydrate(queryClient, value)
        if (done) {
          return Promise.resolve()
        }
        return reader.read().then(handle)
      })
    },
    context: {
      ...ogOptions.context,
      // Pass the query client to the context, so we can access it in loaders
      queryClient,
    },
    // Wrap the app in a QueryClientProvider
    Wrap: ({ children }) => {
      const OuterWrapper = additionalOpts?.WrapProvider || Fragment
      const OGWrap = ogOptions.Wrap || Fragment
      return (
        <OuterWrapper>
          <QueryClientProvider client={queryClient}>
            <OGWrap>{children}</OGWrap>
          </QueryClientProvider>
        </OuterWrapper>
      )
    },
  }

  return router
}

type PushableStream = {
  stream: ReadableStream
  enqueue: (chunk: unknown) => void
  close: () => void
  isClosed: boolean
  error: (err: unknown) => void
}
function createPushableStream(): PushableStream {
  let controllerRef: ReadableStreamDefaultController | undefined
  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller
    },
  })
  let isClosed = false

  return {
    stream,
    enqueue: (chunk) => controllerRef?.enqueue(chunk),
    close: () => {
      controllerRef?.close()
      isClosed = true
    },
    isClosed,
    error: (err: unknown) => controllerRef?.error(err),
  }
}
