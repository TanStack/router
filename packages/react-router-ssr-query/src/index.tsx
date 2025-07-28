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
  const ogOptions = router.options

  router.options = {
    ...router.options,
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

  if (router.isServer) {
    const queryStream = createPushableStream()

    router.options.dehydrate =
      async (): Promise<DehydratedRouterQueryState> => {
        const ogDehydrated = await ogOptions.dehydrate?.()
        const dehydratedQueryClient = queryDehydrate(queryClient)

        router.serverSsr!.onRenderFinished(() => queryStream.close())

        const dehydratedRouter = {
          ...ogDehydrated,
          // When critical data is dehydrated, we also dehydrate the query client
          dehydratedQueryClient,
          // prepare the stream for queries coming up during rendering
          queryStream: queryStream.stream,
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

    queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'added') {
        // before rendering starts, we do not stream individual queries
        // instead we dehydrate the entire query client in router's dehydrate()
        if (!router.serverSsr!.isDehydrated()) {
          return
        }
        if (queryStream.isClosed()) {
          console.warn(
            `tried to stream query ${event.query.queryHash} after stream was already closed`,
          )
          return
        }
        queryStream.enqueue(
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
    // on the client
  } else {
    router.options.hydrate = async (dehydrated: DehydratedRouterQueryState) => {
      await ogOptions.hydrate?.(dehydrated)
      // On the client, hydrate the query client with the dehydrated data
      queryHydrate(queryClient, dehydrated.dehydratedQueryClient)

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
    }
  }

  return router
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
