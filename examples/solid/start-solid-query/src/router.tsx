import { createRouter } from '@tanstack/solid-router'
import { QueryClient } from '@tanstack/solid-query'
import { routeTree } from './routeTree.gen'
import './styles.css'

export function getRouter() {
  const queryClient = new QueryClient()

  // Set up a Router instance
  const router = createRouter({
    routeTree,
    context: {
      queryClient,
    },
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Since we're using React Query, we don't want loader calls to ever be stale
    // This will ensure that the loader is always called when the route is preloaded or visited
    defaultPreloadStaleTime: 0,
  })

  return router
}
