import { createRouter } from '@tanstack/vue-router'
import { createSsrQueryPlugin } from '@tanstack/vue-router-ssr-query'
import { QueryClient } from '@tanstack/vue-query'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

export function getRouter() {
  const queryClient = new QueryClient()
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
    plugins: [createSsrQueryPlugin({ queryClient })],
  })
}
