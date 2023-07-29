import { Router, RouterContext } from '@tanstack/router'
import { LoaderClientProvider } from '@tanstack/react-loaders'

import { rootRoute } from './routes/root'
import { indexRoute } from './routes/index'
import { postsRoute } from './routes/posts'
import { postsIndexRoute } from './routes/posts/index'
import { postIdRoute } from './routes/posts/$postId'

import { createLoaderClient } from './loaderClient'
import React from 'react'

export const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postIdRoute]),
])

export function createRouter() {
  const loaderClient = createLoaderClient()

  const router = new Router({
    routeTree,
    context: {
      loaderClient,
      head: '',
    },
    // On the server, dehydrate the loader client
    dehydrate: () => {
      return {
        loaderClient: loaderClient.dehydrate(),
      }
    },
    // On the client, rehydrate the loader client
    hydrate: (dehydrated) => {
      loaderClient.hydrate(dehydrated.loaderClient)
    },
    // Wrap our router in the loader client provider
    Wrap: ({ children }) => {
      return (
        <LoaderClientProvider client={loaderClient}>
          {children}
        </LoaderClientProvider>
      )
    },
  })

  // Provide hydration and dehydration functions to loader instances
  loaderClient.options = {
    ...loaderClient.options,
    hydrateLoaderInstanceFn: (instance) =>
      router.hydrateData(instance.hashedKey) as any,
    dehydrateLoaderInstanceFn: (instance) =>
      router.dehydrateData(instance.hashedKey, () => instance),
  }

  return router
}

declare module '@tanstack/router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
