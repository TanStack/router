import { useEffect } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  hydrate,
  useQueryErrorResetBoundary,
} from '@tanstack/react-query'
import {
  createRouter as createTanstackRouter,
  useLocation,
  useRouter,
} from '@tanstack/react-router'
import { httpBatchLink, loggerLink } from '@trpc/client'
import { SuperJSON } from 'superjson'
import { createTRPCQueryUtils } from '@trpc/react-query'

import { routeTree } from './routeTree.gen.ts'
import trpc from './utils/trpc.ts'

/** @see https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading#critical-dehydrationhydration */
export function createRouter() {
  const queryClient = new QueryClient()
  const trpcClient = trpc.createClient({
    links: [
      loggerLink({
        enabled: (opts) =>
          import.meta.env.DEV ||
          (opts.direction === 'down' && opts.result instanceof Error),
      }),
      httpBatchLink({
        transformer: SuperJSON,
        url: 'http://localhost:3000/trpc',
      }),
    ],
  })
  const trpcQueryUtils = createTRPCQueryUtils({
    client: trpcClient,
    queryClient,
  })

  const router = createTanstackRouter({
    context: {
      trpcQueryUtils,
    },
    defaultPreload: 'intent',
    defaultErrorComponent: ({ error, info, reset }) => {
      const router = useRouter()

      const queryErrorResetBoundary = useQueryErrorResetBoundary()

      if (
        (error as Error).message.includes(
          'Failed to fetch dynamically imported module',
        )
      ) {
        window.location.reload()
      }

      /** @see https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading#error-handling-with-tanstack-query */
      useEffect(() => {
        // Reset the query error boundary
        queryErrorResetBoundary.reset()
      }, [queryErrorResetBoundary])

      return (
        <>
          <h1>Error</h1>
          {info && <p>{info.componentStack}</p>}
          <p>{error.message}</p>
          <button
            onClick={() => {
              reset()
              router.invalidate()
            }}
            type="button"
          >
            Reset
          </button>
        </>
      )
    },
    defaultNotFoundComponent: ({ data }) => {
      const href = useLocation({ select: ({ href }) => href })

      return (
        <main>
          <h1>404</h1>
          <p>
            {typeof data === 'object' &&
            data &&
            'data' in data &&
            typeof data['data'] === 'string'
              ? data.data
              : // as we have things configured currently, this should never be reached unless you put a bad link in your code or otherwise navigate to an undefined route from within your app.  the reason why is because the server won't have a route registered if you try to load a bad url in the browser directly, so it will respond with JSON, not HTML / JS.  you could alternatively register a wildcard handler for your fastify server after calling await server.vite.ready (src/server/index.ts), which should simply return reply.html(), you also would not need to define createRoute, createRouteHandler, createErrorHandler or prepareClient in your renderer configuration for @fastify/vite (src/server/renderer.tsx), then this message would display for any requested url other than one which you have explicitly defined (src/client/routes).
                `http://localhost:3000${href} does not exist...`}
          </p>
        </main>
      )
    },
    defaultPendingComponent: () => <div>Pending...</div>,
    dehydrate() {
      return {
        queryClientState: dehydrate(queryClient),
      }
    },
    hydrate(dehydrated) {
      hydrate(queryClient, dehydrated.queryClientState)
    },
    notFoundMode: 'fuzzy',
    routeTree,
    transformer: SuperJSON,
    Wrap({ children }) {
      return (
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </trpc.Provider>
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
