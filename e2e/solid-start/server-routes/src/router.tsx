import { createRouter } from '@tanstack/solid-router'
import { createSsrQueryPlugin } from '@tanstack/solid-router-ssr-query'
import { QueryClient } from '@tanstack/solid-query'
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
