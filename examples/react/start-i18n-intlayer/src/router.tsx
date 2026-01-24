import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

export const queryClient = new QueryClient()

// Create a new router instance
export const getRouter = () => {
  const router = createRouter({
    context: {
      queryClient,
    },
    defaultPreloadStaleTime: 0,
    routeTree,
    scrollRestoration: true,
  })

  return router
}
