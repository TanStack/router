import { Router } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import {
  QueryClient,
  MutationCache,
  notifyManager,
  QueryClientProvider,
} from '@tanstack/react-query'

export function createRouter() {
  notifyManager.setScheduler(window.requestAnimationFrame)

  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnReconnect: () => !queryClient.isMutating(),
      },
    },
    mutationCache: new MutationCache({
      onSettled: () => {
        if (queryClient.isMutating() === 1) {
          return queryClient.invalidateQueries()
        }
      },
    }),
  })

  const router = new Router({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    Wrap: ({ children }) => {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )
    },
    context: {
      queryClient,
    },
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
