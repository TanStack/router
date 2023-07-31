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
  dehydrate,
} from '@tanstack/react-query'
import { createServerSideHelpers } from '@trpc/react-query/server'
import { unstable_httpBatchStreamLink } from '@trpc/react-query'
import { trpc } from './utils/trpc'

export const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postIdRoute]),
])

export function createRouter() {
  const queryClient = new QueryClient()

  const trpcClient = trpc.createClient({
    links: [unstable_httpBatchStreamLink({ url: 'http://localhost:4000' })],
  })

  const ssg = createServerSideHelpers({
    client: trpcClient,
  })

  const router = new Router({
    routeTree,
    context: {
      ssg,
      head: '',
    },
    // On the server, dehydrate the query client
    dehydrate: () => {
      return {
        ssg: ssg.dehydrate(),
      }
    },
    // Unsure if this is doing anything
    hydrate: (dehydratedState) => {
      hydrate(queryClient, dehydratedState.ssg)
    },
    // Wrap our router in the loader client provider
    Wrap: (props) => {
      // Makes sure the dehydrated state is transformed properly
      const dehydratedState = trpc.useDehydratedState(
        trpcClient,
        router.dehydratedData?.ssg,
      )

      return (
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <Hydrate state={dehydratedState}>{props.children}</Hydrate>
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
