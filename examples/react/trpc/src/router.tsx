import { Router } from '@tanstack/router'

import { rootRoute } from './routes/root'
import { indexRoute } from './routes/index'
import { postsRoute } from './routes/posts'
import { postsIndexRoute } from './routes/posts/index'
import { postIdRoute } from './routes/posts/$postId'
import {
  QueryClient,
  QueryClientProvider,
  hydrate,
} from '@tanstack/react-query'

import { createServerSideHelpers } from '@trpc/react-query/server'
import { AppRouter } from './server/trpc'
import {
  CreateTRPCClientOptions,
  createTRPCProxyClient,
  createTRPCReact,
  httpBatchLink,
} from '@trpc/react-query'

export type RouterContext = {
  ssg: ReturnType<typeof createServerSideHelpers<AppRouter>>
  trpc: ReturnType<typeof createTRPCReact<AppRouter>>
  head: string
}

export const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postIdRoute]),
])

export function createRouter() {
  const queryClient = new QueryClient()
  const trpc = createTRPCReact<AppRouter>()

  const clientOptions: CreateTRPCClientOptions<AppRouter> = {
    links: [httpBatchLink({ url: 'http://localhost:4000' })],
  }

  const ssg = createServerSideHelpers<AppRouter>({
    client: createTRPCProxyClient(clientOptions),
  })

  const router = new Router({
    routeTree,
    context: {
      ssg: ssg,
      trpc,
      head: '',
    },
    // On the server, dehydrate the query client
    dehydrate: () => ssg.dehydrate(),
    // On the client, rehydrate the query client
    hydrate: (dehydrated) => {
      hydrate(queryClient, dehydrated)
    },
    // Wrap our router in the loader client provider
    Wrap: (props) => {
      return (
        <trpc.Provider
          client={trpc.createClient(clientOptions)}
          queryClient={queryClient}
        >
          <QueryClientProvider client={queryClient}>
            {/** @ts-ignore - not sure what it complains about... */}
            {props.children}
          </QueryClientProvider>
        </trpc.Provider>
      )
    },
  })

  return router
}

declare module '@tanstack/router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
