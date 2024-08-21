import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { createTRPCQueryUtils, createTRPCReact } from '@trpc/react-query'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

import { Spinner } from './routes/-components/spinner'
import type { AppRouter } from '../trpc-server.handler'

export const queryClient = new QueryClient()

export const trpc = createTRPCReact<AppRouter>({})

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      // since we are using Vinxi, the server is running on the same port,
      // this means in dev the url is `http://localhost:3000/trpc`
      // and since its from the same origin, we don't need to explicitly set the full URL
      url: '/trpc',
    }),
  ],
})

export const trpcQueryUtils = createTRPCQueryUtils({
  queryClient,
  client: trpcClient,
})

export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    context: {
      trpcQueryUtils,
    },
    defaultPendingComponent: () => (
      <div className={`p-2 text-2xl`}>
        <Spinner />
      </div>
    ),
    Wrap: function WrapComponent({ children }) {
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

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
