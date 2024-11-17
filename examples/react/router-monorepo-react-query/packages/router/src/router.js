import { jsx as _jsx } from 'react/jsx-runtime'
import { createRouter } from '@tanstack/react-router'
// Import the generated route tree
import { QueryClient } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
export const queryClient = new QueryClient()
// Set up a Router instance
export const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPendingComponent: () =>
    _jsx('div', { children: 'Loading form global pending component...' }),
  // This make the loader only wait 200ms before showing the pending component, instead of the default 1000ms
  defaultPendingMs: 200,
  defaultPreload: 'intent',
  // Since we're using React Query, we don't want loader calls to ever be stale
  // This will ensure that the loader is always called when the route is preloaded or visited
  defaultPreloadStaleTime: 0,
})
