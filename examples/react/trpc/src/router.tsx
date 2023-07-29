import { Router } from '@tanstack/router'

import { rootRoute } from './routes/root'
import { indexRoute } from './routes/index'
import { postsRoute } from './routes/posts'
import { postsIndexRoute } from './routes/posts/index'
import { postIdRoute } from './routes/posts/$postId'
import {
  Hydrate,
  QueryClient,
  QueryClientProvider,
  hydrate,
} from '@tanstack/react-query'

import { createServerSideHelpers } from '@trpc/react-query/server'
import { AppRouter } from './server/trpc'
import { httpBatchLink } from '@trpc/react-query'
import { trpc } from './utils/trpc'

export type RouterContext = {
  ssg: ReturnType<typeof createServerSideHelpers<AppRouter>>
  head: string
}

export const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postIdRoute]),
])

export function createRouter() {
  const queryClient = new QueryClient()

  const trpcClient = trpc.createClient({
    links: [httpBatchLink({ url: 'http://localhost:4000' })],
  })

  const ssg = createServerSideHelpers<AppRouter>({
    client: trpcClient,
  })

  const router = new Router({
    routeTree,
    context: {
      ssg: ssg,
      head: '',
    },
    // On the server, dehydrate the query client
    dehydrate: () => {
      const state = ssg.dehydrate()
      console.log('dehydrate', state)
      return state
    },
    // On the client, rehydrate the query client
    hydrate: (dehydrated) => {
      console.log('hydrate', dehydrated)
      hydrate(queryClient, dehydrated)
    },
    // Wrap our router in the loader client provider
    Wrap: (props) => {
      // Makes sure the dehydratede state is transformed properly
      const dehydratedState = trpc.useDehydratedState(
        trpcClient,
        props.dehydratedState,
      )

      return (
        <QueryClientProvider client={queryClient}>
          <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <Hydrate state={dehydratedState}>
              {/** @ts-ignore - not sure what it complains about... probably some mismatching @types/react versions */}
              {props.children}
            </Hydrate>
          </trpc.Provider>
        </QueryClientProvider>
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
