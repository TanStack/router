import { Router } from '@tanstack/router'

import { rootRoute } from './routes/root'
import { indexRoute } from './routes/index'
import { postsRoute } from './routes/posts'
import { postsIndexRoute } from './routes/posts/index'
import { postIdRoute } from './routes/posts/$postId'

import { createLoaderClient } from './loaderClient'
import { LoaderClientProvider } from '@tanstack/react-loaders'

export const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postIdRoute]),
])

export function createRouter() {
  const loaderClient = createLoaderClient()

  return new Router({
    routeTree,
    context: {
      loaderClient,
    },
    dehydrate: () => {
      return {
        loaderClient: loaderClient.dehydrate(),
      }
    },
    hydrate: (ctx) => {
      loaderClient.hydrate(ctx.loaderClient)
    },
    Provider: ({ children }) => {
      return (
        <LoaderClientProvider loaderClient={loaderClient}>
          {children}
        </LoaderClientProvider>
      )
    },
  })
}

declare module '@tanstack/router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
